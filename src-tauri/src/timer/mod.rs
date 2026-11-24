//! The timer engine.
//!
//! It lives in the Rust core and owns the truth about the current session. It
//! keeps a wall-clock deadline (`ends_at`) instead of counting down in a loop,
//! so closing or minimising the window cannot make the timer drift.
//!
//! Everything that reaches the outside world (events, notifications, tray icon)
//! goes through the [`TimerHost`] trait. That keeps the engine testable without
//! a running Tauri app.

pub mod state;

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::error::AppError;
use crate::models::{
    now_utc, to_sql_timestamp, Preset, SessionCompletePayload, SessionType, Settings, TickPayload,
    TimerSnapshot, TimerStatus,
};
use crate::repositories::{
    app_state, presets as preset_repo, sessions, sessions::NewSession, subtasks as subtask_repo,
    tasks as task_repo,
};

use state::{duration_ms, format_clock, is_mid_session, next_break_type};

/// How often the tick loop wakes up while the timer is running.
const TICK_INTERVAL_MS: u64 = 250;

/// How often the running state is written to disk (crash recovery).
const SNAPSHOT_EVERY_MS: i64 = 5_000;

/// Everything the engine needs from the outside world.
pub trait TimerHost: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
    fn notify(&self, title: &str, body: &str, next_type: SessionType);
    fn refresh_tray(&self, snapshot: &TimerSnapshot);
}

/// The real host: pushes events into the webview, shows OS notifications and
/// updates the tray tooltip.
pub struct TauriHost {
    app: AppHandle,
}

impl TauriHost {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl TimerHost for TauriHost {
    fn emit(&self, event: &str, payload: Value) {
        if let Err(error) = self.app.emit(event, payload) {
            eprintln!("[pomodesk] could not emit {event}: {error:?}");
        }
    }

    fn notify(&self, title: &str, body: &str, next_type: SessionType) {
        use tauri_plugin_notification::{Action, ActionType, NotificationExt};

        let action_label = match next_type {
            SessionType::Focus => "Start session",
            SessionType::ShortBreak | SessionType::LongBreak => "Start break",
        };

        let action_type = ActionType::builder("pomodesk-session")
            .actions(vec![
                Action::builder("close", "Close").build(),
                Action::builder("start", action_label).build(),
            ])
            .build();

        if let Err(error) = self.app.notification().register_action_types(vec![action_type]) {
            eprintln!("[pomodesk] could not register notification actions: {error:?}");
        }

        let builder = self
            .app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .action_type_id("pomodesk-session");

        if let Err(error) = builder.show() {
            eprintln!("[pomodesk] notification failed: {error:?}");
        }
    }
    fn refresh_tray(&self, snapshot: &TimerSnapshot) {
        crate::tray::refresh(&self.app, snapshot);
    }
}

pub struct TimerEngine {
    pool: SqlitePool,
    host: Arc<dyn TimerHost>,
    state: Mutex<TimerSnapshot>,
    last_snapshot_ms: AtomicI64,
}

impl TimerEngine {
    /// Loads the persisted state (including crash recovery) and returns a ready
    /// engine. The caller stores it in `AppState` and starts the tick loop.
    pub async fn new(pool: SqlitePool, host: Arc<dyn TimerHost>) -> Result<Arc<Self>, AppError> {
        let mut conn = pool.acquire().await?;

        let presets = preset_repo::list(&mut conn).await?;
        let Some(first_preset) = presets.first().cloned() else {
            return Err(AppError::internal(
                "PomoDesk has no timer presets saved. Please reinstall or reset the app data.",
            ));
        };

        let active_preset = app_state::get_i64(&mut conn, app_state::ACTIVE_PRESET_ID)
            .await?
            .and_then(|id| presets.iter().find(|preset| preset.id == id).cloned())
            .unwrap_or(first_preset);

        let cycle_focus_count = app_state::get_i64(&mut conn, app_state::CYCLE_FOCUS_COUNT)
            .await?
            .unwrap_or(0);

        // Only one active task may exist, and it must still be open.
        if let Some(task_id) = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await? {
            let still_valid = matches!(
                task_repo::get(&mut conn, task_id).await,
                Ok(task) if !task.is_done
            );
            if !still_valid {
                app_state::remove(&mut conn, app_state::ACTIVE_TASK_ID).await?;
            }
        }

        let mut snapshot = state::fresh_focus(&active_preset, cycle_focus_count);

        if let Some(raw) = app_state::get(&mut conn, app_state::TIMER_SNAPSHOT).await? {
            match serde_json::from_str::<TimerSnapshot>(&raw) {
                Ok(saved) => {
                    let saved_preset = presets
                        .iter()
                        .find(|preset| preset.id == saved.active_preset_id);
                    match saved_preset {
                        Some(preset) => {
                            snapshot = state::restore(&saved, preset, cycle_focus_count, state::now_ms());
                        }
                        None => {
                            // The preset used by the saved session was deleted.
                            eprintln!("[pomodesk] saved timer used a deleted preset; starting fresh");
                        }
                    }
                }
                Err(error) => eprintln!("[pomodesk] saved timer state unreadable: {error:?}"),
            }
        }

        // Keep app_state in sync with whatever we actually restored.
        app_state::set_i64(
            &mut conn,
            app_state::ACTIVE_PRESET_ID,
            snapshot.active_preset_id,
        )
        .await?;
        app_state::set(
            &mut conn,
            app_state::TIMER_SNAPSHOT,
            &serde_json::to_string(&snapshot)?,
        )
        .await?;
        drop(conn);

        Ok(Arc::new(Self {
            pool,
            host,
            state: Mutex::new(snapshot),
            last_snapshot_ms: AtomicI64::new(0),
        }))
    }

    /// Starts the background loop. Only call this once, from app setup.
    pub fn spawn_tick_loop(self: &Arc<Self>) {
        let engine = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_millis(TICK_INTERVAL_MS));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                engine.tick_at(state::now_ms()).await;
            }
        });
    }

    pub async fn snapshot(&self) -> TimerSnapshot {
        self.state.lock().await.clone()
    }

    // -----------------------------------------------------------------------
    // User actions
    // -----------------------------------------------------------------------

    /// Starts an idle session. If the timer is paused this behaves like resume.
    pub async fn start(&self) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;

        match snapshot.status {
            TimerStatus::Running => return Ok(snapshot.clone()),
            TimerStatus::Paused => return self.resume_locked(&mut snapshot).await,
            TimerStatus::Idle => {}
        }

        if snapshot.remaining_ms <= 0 {
            snapshot.remaining_ms = snapshot.total_ms;
        }
        snapshot.status = TimerStatus::Running;
        snapshot.ends_at = Some(state::now_ms() + snapshot.remaining_ms);
        snapshot.started_at = Some(to_sql_timestamp(now_utc()));

        self.after_change(&mut snapshot).await?;
        Ok(snapshot.clone())
    }

    pub async fn pause(&self) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;

        if snapshot.status == TimerStatus::Running {
            let now = state::now_ms();
            snapshot.remaining_ms = state::remaining_from_deadline(snapshot.ends_at.unwrap_or(now), now);
            snapshot.ends_at = None;
            snapshot.status = TimerStatus::Paused;
            self.after_change(&mut snapshot).await?;
        }

        Ok(snapshot.clone())
    }

    pub async fn resume(&self) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;

        if snapshot.status == TimerStatus::Paused {
            return self.resume_locked(&mut snapshot).await;
        }

        Ok(snapshot.clone())
    }

    /// Throws away the current session without crediting anything.
    pub async fn skip(&self) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;
        let preset = self.load_preset(snapshot.active_preset_id).await?;

        let next = if snapshot.session_type == SessionType::Focus {
            // A skip earns no credit and does not advance the cycle, so the
            // break is chosen from the count the user has actually completed.
            next_break_type(snapshot.cycle_focus_count, preset.long_break_every)
        } else {
            SessionType::Focus
        };

        state::advance_to(&mut snapshot, next, &preset, false, state::now_ms());
        self.after_change(&mut snapshot).await?;
        Ok(snapshot.clone())
    }

    /// Restarts the current session type from the beginning without logging it.
    pub async fn reset(&self) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;
        let preset = self.load_preset(snapshot.active_preset_id).await?;
        let current = snapshot.session_type;

        state::advance_to(&mut snapshot, current, &preset, false, state::now_ms());
        self.after_change(&mut snapshot).await?;
        Ok(snapshot.clone())
    }

    /// Ends the current focus session now and counts it as completed. Used by
    /// the "End session" button for the case where only a few minutes are
    /// left. Breaks cannot be ended this way; use Skip for those.
    pub async fn end_session(&self) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;

        if snapshot.session_type != SessionType::Focus {
            return Err(AppError::conflict(
                "Only a focus session can be ended early. Use Skip to leave a break.",
            ));
        }
        if !is_mid_session(&snapshot) {
            return Err(AppError::conflict("This session hasn't started yet."));
        }

        let now = state::now_ms();
        if snapshot.status == TimerStatus::Running {
            snapshot.remaining_ms =
                state::remaining_from_deadline(snapshot.ends_at.unwrap_or(now), now);
        }
        let elapsed_ms = (snapshot.total_ms - snapshot.remaining_ms).max(1000);
        snapshot.remaining_ms = 0;

        self.complete_locked(&mut snapshot, now, Some(elapsed_ms)).await;
        Ok(snapshot.clone())
    }

    /// Switches the preset. While a focus session is in progress this refuses
    /// unless `force` is true; the frontend then asks the user first.
    pub async fn switch_preset(
        &self,
        preset_id: i64,
        force: bool,
    ) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;
        let preset = self.load_preset(preset_id).await?;

        if !force && is_mid_session(&snapshot) {
            return Err(AppError::NeedsConfirmation {
                message: format!(
                    "Switch to \"{}\"? Your current focus session ({} left) will be discarded and won't count.",
                    preset.name,
                    format_clock(snapshot.remaining_ms)
                ),
                remaining_ms: snapshot.remaining_ms,
                preset_name: preset.name.clone(),
            });
        }

        state::advance_to(
            &mut snapshot,
            SessionType::Focus,
            &preset,
            false,
            state::now_ms(),
        );
        snapshot.active_preset_id = preset.id;
        self.after_change(&mut snapshot).await?;
        Ok(snapshot.clone())
    }

    /// Switches the current session type. A focus session in progress needs
    /// confirmation, exactly like switching presets does; leaving a break is
    /// silent.
    pub async fn switch_session_type(
        &self,
        kind: SessionType,
        force: bool,
    ) -> Result<TimerSnapshot, AppError> {
        let mut snapshot = self.state.lock().await;

        // Clicking the tab that is already active must never punish the user.
        if kind == snapshot.session_type && snapshot.status != TimerStatus::Idle {
            return Ok(snapshot.clone());
        }

        let preset = self.load_preset(snapshot.active_preset_id).await?;

        if !force && kind != snapshot.session_type && is_mid_session(&snapshot) {
            let label = match kind {
                SessionType::Focus => "Focus",
                SessionType::ShortBreak => "Break",
                SessionType::LongBreak => "Long break",
            };
            return Err(AppError::NeedsConfirmation {
                message: format!(
                    "Switch to {}? Your current focus session ({} left) will be discarded and won't count.",
                    label,
                    format_clock(snapshot.remaining_ms)
                ),
                remaining_ms: snapshot.remaining_ms,
                preset_name: preset.name.clone(),
            });
        }

        state::advance_to(&mut snapshot, kind, &preset, false, state::now_ms());
        self.after_change(&mut snapshot).await?;
        Ok(snapshot.clone())
    }

    /// Called after the active preset's durations were edited. Idle timers pick
    /// the change up immediately; a session in progress keeps its length and
    /// gets the new duration next time.
    pub async fn apply_preset_edit(&self, preset: &Preset) -> Result<(), AppError> {
        let mut snapshot = self.state.lock().await;

        if snapshot.active_preset_id != preset.id {
            return Ok(());
        }

        let at_rest = snapshot.status == TimerStatus::Idle
            || (snapshot.status == TimerStatus::Paused && snapshot.remaining_ms >= snapshot.total_ms);

        if !at_rest {
            return Ok(());
        }

        let total = duration_ms(preset, snapshot.session_type);
        snapshot.total_ms = total;
        snapshot.remaining_ms = total;
        snapshot.status = TimerStatus::Idle;
        snapshot.ends_at = None;
        snapshot.started_at = None;

        self.after_change(&mut snapshot).await
    }

    // -----------------------------------------------------------------------
    // Tick loop
    // -----------------------------------------------------------------------

    /// One tick of the clock. `now` is injected so tests can jump forward in
    /// time without sleeping.
    pub async fn tick_at(&self, now: i64) {
        let mut snapshot = self.state.lock().await;

        if snapshot.status != TimerStatus::Running {
            return;
        }

        let ends_at = snapshot.ends_at.unwrap_or(now);
        let remaining = ends_at - now;

        if remaining <= 0 {
            snapshot.remaining_ms = 0;
            self.complete_locked(&mut snapshot, now, None).await;
            return;
        }

        snapshot.remaining_ms = remaining;

        self.host.emit(
            "timer:tick",
            serde_json::to_value(TickPayload {
                session_type: snapshot.session_type,
                status: snapshot.status,
                remaining_ms: snapshot.remaining_ms,
                total_ms: snapshot.total_ms,
                cycle_focus_count: snapshot.cycle_focus_count,
                active_preset_id: snapshot.active_preset_id,
            })
            .unwrap_or(Value::Null),
        );
        self.host.refresh_tray(&snapshot);

        if now - self.last_snapshot_ms.load(Ordering::Relaxed) >= SNAPSHOT_EVERY_MS {
            self.last_snapshot_ms.store(now, Ordering::Relaxed);
            if let Err(error) = self.persist(&snapshot).await {
                eprintln!("[pomodesk] could not save timer state: {}", error.message());
            }
        }
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    async fn resume_locked(&self, snapshot: &mut TimerSnapshot) -> Result<TimerSnapshot, AppError> {
        snapshot.ends_at = Some(state::now_ms() + snapshot.remaining_ms.max(0));
        snapshot.status = TimerStatus::Running;
        if snapshot.started_at.is_none() {
            snapshot.started_at = Some(to_sql_timestamp(now_utc()));
        }
        self.after_change(snapshot).await?;
        Ok(snapshot.clone())
    }

    /// Persists and announces a state change caused by the user.
    async fn after_change(&self, snapshot: &mut TimerSnapshot) -> Result<(), AppError> {
        self.persist(snapshot).await?;
        self.host.emit(
            "timer:state_changed",
            serde_json::to_value(&*snapshot).unwrap_or(Value::Null),
        );
        self.host.refresh_tray(snapshot);
        Ok(())
    }

    async fn persist(&self, snapshot: &TimerSnapshot) -> Result<(), AppError> {
        let mut conn = self.pool.acquire().await?;
        app_state::set(
            &mut conn,
            app_state::TIMER_SNAPSHOT,
            &serde_json::to_string(snapshot)?,
        )
        .await?;
        app_state::set_i64(
            &mut conn,
            app_state::ACTIVE_PRESET_ID,
            snapshot.active_preset_id,
        )
        .await?;
        Ok(())
    }

    async fn load_preset(&self, id: i64) -> Result<Preset, AppError> {
        let mut conn = self.pool.acquire().await?;
        preset_repo::get(&mut conn, id).await
    }

    async fn load_settings(&self) -> Result<Settings, AppError> {
        let mut conn = self.pool.acquire().await?;
        match app_state::get(&mut conn, app_state::SETTINGS).await? {
            Some(raw) => Ok(serde_json::from_str::<Settings>(&raw).unwrap_or_default()),
            None => Ok(Settings::default()),
        }
    }

    /// The pipeline that runs when any session reaches zero.
    async fn complete_locked(&self, snapshot: &mut TimerSnapshot, now: i64, duration_override: Option<i64>) {
        let preset = match self.load_preset(snapshot.active_preset_id).await {
            Ok(preset) => preset,
            Err(error) => {
                eprintln!("[pomodesk] cannot complete session: {}", error.message());
                snapshot.status = TimerStatus::Idle;
                snapshot.ends_at = None;
                return;
            }
        };

        let settings = self.load_settings().await.unwrap_or_default();
        let completed = snapshot.session_type;
        let ended_at = now_utc();
        let mut credited_task_id = None;

        // The cycle value used to choose the break. It normally advances with
        // the finished focus session, but if the database write fails we still
        // pick the break the user would have expected.
        let mut cycle_for_break = snapshot.cycle_focus_count;

        if completed == SessionType::Focus {
            let intended_cycle = snapshot.cycle_focus_count + 1;
            cycle_for_break = intended_cycle;

            match self
                .record_focus_completion(&preset, snapshot, ended_at, duration_override)
                .await
            {
                Ok(credited) => {
                    credited_task_id = credited;
                    snapshot.cycle_focus_count = intended_cycle;
                }
                Err(error) => {
                    // The timer must not freeze because a write failed; the
                    // session is simply not counted and the cycle is unchanged.
                    eprintln!("[pomodesk] focus session not saved: {}", error.message());
                }
            }
        } else if completed == SessionType::LongBreak {
            // Finishing a long break starts a brand-new cycle.
            if let Err(error) = self.reset_cycle_count().await {
                eprintln!("[pomodesk] could not reset cycle: {error:?}");
            }
            snapshot.cycle_focus_count = 0;
            cycle_for_break = 0;
        }

        let next = match completed {
            SessionType::Focus => next_break_type(cycle_for_break, preset.long_break_every),
            SessionType::ShortBreak | SessionType::LongBreak => SessionType::Focus,
        };

        let will_auto_start = match completed {
            SessionType::Focus => settings.auto_start_breaks,
            _ => settings.auto_start_focus,
        };

        state::advance_to(snapshot, next, &preset, will_auto_start, now);
        if will_auto_start {
            snapshot.started_at = Some(to_sql_timestamp(ended_at));
        }

        if let Err(error) = self.persist(snapshot).await {
            eprintln!("[pomodesk] could not save timer state: {}", error.message());
        }

        self.host.emit(
            "timer:session_complete",
            serde_json::to_value(SessionCompletePayload {
                completed_type: completed,
                next_type: next,
                credited_task_id,
                will_auto_start,
            })
            .unwrap_or(Value::Null),
        );

        if credited_task_id.is_some() {
            self.host.emit("tasks:changed", Value::Null);
        }

        if settings.notifications_enabled {
            let (title, body) = completion_message(completed);
            self.host.notify(title, body, next);
        }

        self.host.emit(
            "timer:state_changed",
            serde_json::to_value(&*snapshot).unwrap_or(Value::Null),
        );
        self.host.refresh_tray(snapshot);
    }

    /// Writes the session row, credits the active task and bumps the cycle
    /// counter — all inside one transaction, so it is all-or-nothing.
    ///
    /// `duration_override` lets an early end log the elapsed time instead of
    /// the planned duration; `None` keeps the planned duration.
    async fn record_focus_completion(
        &self,
        preset: &Preset,
        snapshot: &TimerSnapshot,
        ended_at: chrono::DateTime<chrono::Utc>,
        duration_override: Option<i64>,
    ) -> Result<Option<i64>, AppError> {
        let mut tx = self.pool.begin().await?;

        let active_task_id = app_state::get_i64(&mut tx, app_state::ACTIVE_TASK_ID).await?;
        let mut credited = None;
        let mut task_title = None;

        if let Some(task_id) = active_task_id {
            match task_repo::get(&mut tx, task_id).await {
                Ok(task) if !task.is_done => {
                    task_repo::credit_slot(&mut tx, task_id).await?;
                    credited = Some(task_id);
                    task_title = Some(task.title);

                    // Credit the focused subtask too, when it belongs to this task.
                    if let Some(subtask_id) =
                        app_state::get_i64(&mut tx, app_state::ACTIVE_SUBTASK_ID).await?
                    {
                        if let Ok(subtask) = subtask_repo::get(&mut tx, subtask_id).await {
                            if subtask.task_id == task_id && !subtask.is_done {
                                let _ = subtask_repo::credit_slot(&mut tx, subtask_id).await;
                            }
                        }
                    }
                }
                Ok(_) => {}
                Err(error) => {
                    eprintln!(
                        "[pomodesk] active task vanished before crediting: {}",
                        error.message()
                    );
                }
            }
        }

        sessions::insert(
            &mut tx,
            &NewSession {
                preset_id: Some(preset.id),
                preset_name: preset.name.clone(),
                task_id: credited,
                task_title,
                started_at: snapshot
                    .started_at
                    .clone()
                    .unwrap_or_else(|| to_sql_timestamp(ended_at)),
                ended_at: to_sql_timestamp(ended_at),
                duration_sec: (duration_override.unwrap_or(snapshot.total_ms) / 1000).max(1),
            },
        )
        .await?;

        app_state::set_i64(
            &mut tx,
            app_state::CYCLE_FOCUS_COUNT,
            snapshot.cycle_focus_count + 1,
        )
        .await?;

        tx.commit().await?;
        Ok(credited)
    }

    async fn reset_cycle_count(&self) -> Result<(), AppError> {
        let mut conn = self.pool.acquire().await?;
        app_state::set_i64(&mut conn, app_state::CYCLE_FOCUS_COUNT, 0).await?;
        Ok(())
    }
}

fn completion_message(completed: SessionType) -> (&'static str, &'static str) {
    match completed {
        SessionType::Focus => (
            "Focus session complete",
            "Nice work. Time for a break whenever you're ready.",
        ),
        SessionType::ShortBreak => ("Break over", "Ready for the next focus session?"),
        SessionType::LongBreak => ("Long break over", "Fresh start — ready to focus?"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    struct RecordingHost {
        events: StdMutex<Vec<String>>,
    }

    impl RecordingHost {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                events: StdMutex::new(Vec::new()),
            })
        }

        fn event_names(&self) -> Vec<String> {
            self.events.lock().unwrap().clone()
        }
    }

    impl TimerHost for RecordingHost {
        fn emit(&self, event: &str, _payload: Value) {
            self.events.lock().unwrap().push(event.to_string());
        }
        fn notify(&self, _title: &str, _body: &str, _next_type: SessionType) {}
        fn refresh_tray(&self, _snapshot: &TimerSnapshot) {}
    }

    async fn engine_with(pool: &SqlitePool, host: Arc<RecordingHost>) -> Arc<TimerEngine> {
        TimerEngine::new(pool.clone(), host).await.unwrap()
    }

    async fn engine() -> Arc<TimerEngine> {
        let pool = crate::db::memory_pool().await;
        engine_with(&pool, RecordingHost::new()).await
    }

    /// An engine whose breaks and focus sessions never start on their own, so
    /// each test can drive one session at a time.
    async fn engine_without_auto_start(
        pool: &SqlitePool,
        host: Arc<RecordingHost>,
    ) -> Arc<TimerEngine> {
        let settings = crate::models::Settings {
            auto_start_breaks: false,
            auto_start_focus: false,
            ..crate::models::Settings::default()
        };

        let mut conn = pool.acquire().await.unwrap();
        crate::repositories::app_state::set(
            &mut conn,
            crate::repositories::app_state::SETTINGS,
            &serde_json::to_string(&settings).unwrap(),
        )
        .await
        .unwrap();
        drop(conn);

        engine_with(pool, host).await
    }

    async fn session_count(pool: &SqlitePool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
            .fetch_one(pool)
            .await
            .unwrap()
    }

    async fn add_task(pool: &SqlitePool) -> crate::models::Task {
        crate::services::tasks::create(
            pool,
            &crate::models::TaskInput {
                title: "Write architecture doc".into(),
                note: String::new(),
                est_slots: 3,
                completed_slots: None,
                tags: Vec::new(),
            },
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn start_pause_and_resume_keep_the_remaining_time() {
        let engine = engine().await;

        let running = engine.start().await.unwrap();
        assert_eq!(running.status, TimerStatus::Running);
        assert!(running.ends_at.is_some());

        let paused = engine.pause().await.unwrap();
        assert_eq!(paused.status, TimerStatus::Paused);
        assert!(paused.ends_at.is_none());
        assert!(paused.remaining_ms <= paused.total_ms);

        let resumed = engine.resume().await.unwrap();
        assert_eq!(resumed.status, TimerStatus::Running);
        assert!(resumed.ends_at.is_some());
    }

    #[tokio::test]
    async fn finishing_a_focus_session_logs_it_and_moves_to_a_break() {
        let pool = crate::db::memory_pool().await;
        let host = RecordingHost::new();
        let engine = engine_without_auto_start(&pool, host.clone()).await;

        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await;

        let after = engine.snapshot().await;
        assert_eq!(after.session_type, SessionType::ShortBreak);
        assert_eq!(after.status, TimerStatus::Idle, "auto-start is off here");
        assert_eq!(after.cycle_focus_count, 1);
        assert_eq!(session_count(&pool).await, 1);

        // The view learns about the completion through these two events.
        let events = host.event_names();
        assert!(events.iter().any(|name| name == "timer:session_complete"));
        assert!(events.iter().any(|name| name == "timer:state_changed"));
    }

    #[tokio::test]
    async fn a_completed_focus_session_credits_the_active_task() {
        let pool = crate::db::memory_pool().await;
        let task = add_task(&pool).await;
        crate::services::tasks::set_active(&pool, Some(task.id))
            .await
            .unwrap();

        let engine = engine_with(&pool, RecordingHost::new()).await;
        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await;

        let tasks = crate::services::tasks::list(&pool).await.unwrap();
        let credited = tasks.iter().find(|entry| entry.id == task.id).unwrap();
        assert_eq!(credited.completed_slots, 1);
        assert!(credited.is_active, "the task stays active after a session");
    }

    #[tokio::test]
    async fn ending_a_focus_session_early_counts_it() {
        let pool = crate::db::memory_pool().await;
        let task = add_task(&pool).await;
        crate::services::tasks::set_active(&pool, Some(task.id))
            .await
            .unwrap();

        let engine = engine_without_auto_start(&pool, RecordingHost::new()).await;
        engine.start().await.unwrap();
        // Let a little real time pass so the elapsed duration is measurable.
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;

        let after = engine.end_session().await.unwrap();
        assert_eq!(after.session_type, SessionType::ShortBreak);
        assert_eq!(after.cycle_focus_count, 1);
        assert_eq!(session_count(&pool).await, 1);

        let tasks = crate::services::tasks::list(&pool).await.unwrap();
        let credited = tasks.iter().find(|entry| entry.id == task.id).unwrap();
        assert_eq!(credited.completed_slots, 1);

        // Elapsed duration logged, not the full 25 minutes.
        let duration: i64 =
            sqlx::query_scalar("SELECT duration_sec FROM sessions")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!((1..25 * 60).contains(&duration), "duration was {duration}");
    }

    #[tokio::test]
    async fn switching_session_type_idle_is_silent() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_with(&pool, RecordingHost::new()).await;

        let switched = engine.switch_session_type(SessionType::LongBreak, false).await.unwrap();
        assert_eq!(switched.session_type, SessionType::LongBreak);
        assert_eq!(switched.status, TimerStatus::Idle);
    }

    #[tokio::test]
    async fn switching_session_type_mid_focus_needs_confirmation() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_with(&pool, RecordingHost::new()).await;
        engine.start().await.unwrap();

        let err = engine
            .switch_session_type(SessionType::LongBreak, false)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NeedsConfirmation { .. }));

        let switched = engine
            .switch_session_type(SessionType::LongBreak, true)
            .await
            .unwrap();
        assert_eq!(switched.session_type, SessionType::LongBreak);
        assert_eq!(switched.status, TimerStatus::Idle);
    }

    #[tokio::test]
    async fn a_focus_session_without_an_active_task_is_logged() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_without_auto_start(&pool, RecordingHost::new()).await;

        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await;

        assert_eq!(session_count(&pool).await, 1);
        assert_eq!(engine.snapshot().await.cycle_focus_count, 1);

        let task_id: Option<i64> =
            sqlx::query_scalar("SELECT task_id FROM sessions")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(task_id.is_none(), "orphan session must have no task");
    }

    #[tokio::test]
    async fn ending_a_break_is_refused() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_with(&pool, RecordingHost::new()).await;
        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await; // now on a break
        engine.start().await.unwrap(); // running break

        let err = engine.end_session().await.unwrap_err();
        assert!(matches!(err, AppError::Conflict { .. }));
    }

    #[tokio::test]
    async fn skipping_never_credits_or_logs_anything() {
        let pool = crate::db::memory_pool().await;
        let task = add_task(&pool).await;
        crate::services::tasks::set_active(&pool, Some(task.id))
            .await
            .unwrap();

        let engine = engine_with(&pool, RecordingHost::new()).await;
        engine.start().await.unwrap();
        let skipped = engine.skip().await.unwrap();

        assert_eq!(skipped.session_type, SessionType::ShortBreak);
        assert_eq!(skipped.status, TimerStatus::Idle);
        assert_eq!(skipped.cycle_focus_count, 0);
        assert_eq!(session_count(&pool).await, 0);

        let tasks = crate::services::tasks::list(&pool).await.unwrap();
        assert_eq!(tasks[0].completed_slots, 0);
    }

    #[tokio::test]
    async fn a_skipped_focus_does_not_earn_a_long_break() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_without_auto_start(&pool, RecordingHost::new()).await;

        // "Deep Work" wants a long break after every 2 focus sessions.
        let presets = crate::services::presets::list(&pool).await.unwrap();
        let deep_work = presets
            .iter()
            .find(|preset| preset.name == "Deep Work")
            .unwrap();
        engine.switch_preset(deep_work.id, true).await.unwrap();

        // Finish one focus session, then drain the short break it earned.
        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await;
        assert_eq!(engine.snapshot().await.cycle_focus_count, 1);

        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await;
        assert_eq!(engine.snapshot().await.session_type, SessionType::Focus);

        // Skipping this focus session must not count towards the cycle, so the
        // break is a short one rather than the long break of session two.
        let skipped = engine.skip().await.unwrap();
        assert_eq!(skipped.session_type, SessionType::ShortBreak);
        assert_eq!(skipped.cycle_focus_count, 1);
        assert_eq!(session_count(&pool).await, 1);
    }

    #[tokio::test]
    async fn a_long_break_arrives_after_a_full_cycle() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_with(&pool, RecordingHost::new()).await;

        // Classic preset: a long break after 4 focus sessions.
        for expected_cycle in 1..=3 {
            engine.start().await.unwrap();
            let ends_at = engine.snapshot().await.ends_at.unwrap();
            engine.tick_at(ends_at).await;
            assert_eq!(engine.snapshot().await.cycle_focus_count, expected_cycle);
            assert_eq!(
                engine.snapshot().await.session_type,
                SessionType::ShortBreak
            );

            // Drain the break so the next focus session can start.
            engine.start().await.unwrap();
            let ends_at = engine.snapshot().await.ends_at.unwrap();
            engine.tick_at(ends_at).await;
            assert_eq!(engine.snapshot().await.session_type, SessionType::Focus);
        }

        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await;

        assert_eq!(engine.snapshot().await.session_type, SessionType::LongBreak);
    }

    #[tokio::test]
    async fn a_finished_long_break_resets_the_cycle() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_with(&pool, RecordingHost::new()).await;

        // Walk two focus sessions with the "Deep Work" preset (long break every 2).
        let presets = crate::services::presets::list(&pool).await.unwrap();
        let deep_work = presets
            .iter()
            .find(|preset| preset.name == "Deep Work")
            .unwrap();
        engine.switch_preset(deep_work.id, true).await.unwrap();

        for _ in 0..2 {
            engine.start().await.unwrap();
            let ends_at = engine.snapshot().await.ends_at.unwrap();
            engine.tick_at(ends_at).await;
            if engine.snapshot().await.session_type == SessionType::ShortBreak {
                engine.start().await.unwrap();
                let ends_at = engine.snapshot().await.ends_at.unwrap();
                engine.tick_at(ends_at).await;
            }
        }

        assert_eq!(engine.snapshot().await.session_type, SessionType::LongBreak);

        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await;

        assert_eq!(engine.snapshot().await.cycle_focus_count, 0);
    }

    #[tokio::test]
    async fn switching_preset_mid_focus_needs_confirmation_then_discards() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_with(&pool, RecordingHost::new()).await;
        let presets = crate::services::presets::list(&pool).await.unwrap();
        let active_id = engine.snapshot().await.active_preset_id;
        let other = presets
            .iter()
            .find(|preset| preset.id != active_id)
            .unwrap();

        engine.start().await.unwrap();

        let error = engine.switch_preset(other.id, false).await.unwrap_err();
        assert!(matches!(error, AppError::NeedsConfirmation { .. }));

        let switched = engine.switch_preset(other.id, true).await.unwrap();
        assert_eq!(switched.active_preset_id, other.id);
        assert_eq!(switched.session_type, SessionType::Focus);
        assert_eq!(switched.status, TimerStatus::Idle);
        assert_eq!(switched.cycle_focus_count, 0);
        assert_eq!(session_count(&pool).await, 0);
    }

    #[tokio::test]
    async fn switching_during_a_break_never_asks_for_confirmation() {
        let pool = crate::db::memory_pool().await;
        let engine = engine_with(&pool, RecordingHost::new()).await;

        engine.start().await.unwrap();
        let ends_at = engine.snapshot().await.ends_at.unwrap();
        engine.tick_at(ends_at).await; // now on a break
        engine.start().await.unwrap(); // running break

        let presets = crate::services::presets::list(&pool).await.unwrap();
        let active_id = engine.snapshot().await.active_preset_id;
        let other = presets
            .iter()
            .find(|preset| preset.id != active_id)
            .unwrap();

        let switched = engine.switch_preset(other.id, false).await.unwrap();
        assert_eq!(switched.status, TimerStatus::Idle);
        assert_eq!(switched.session_type, SessionType::Focus);
    }

    #[tokio::test]
    async fn editing_the_active_preset_applies_immediately_when_idle() {
        let engine = engine().await;
        let mut preset = engine.snapshot().await;
        let preset_id = preset.active_preset_id;
        let all = crate::services::presets::list(&engine.pool).await.unwrap();
        let current = all
            .iter()
            .find(|entry| entry.id == preset_id)
            .unwrap()
            .clone();

        let edited = crate::models::PresetInput {
            name: current.name.clone(),
            focus_sec: 40 * 60,
            short_break_sec: current.short_break_sec,
            long_break_sec: current.long_break_sec,
            long_break_every: current.long_break_every,
        };
        let updated = crate::services::presets::update(&engine.pool, preset_id, &edited)
            .await
            .unwrap();
        engine.apply_preset_edit(&updated).await.unwrap();

        preset = engine.snapshot().await;
        assert_eq!(preset.total_ms, 40 * 60 * 1000);
        assert_eq!(preset.remaining_ms, 40 * 60 * 1000);
    }

    #[tokio::test]
    async fn editing_the_active_preset_does_not_cut_a_running_session() {
        let engine = engine().await;
        let before = engine.start().await.unwrap();
        let preset_id = before.active_preset_id;
        let all = crate::services::presets::list(&engine.pool).await.unwrap();
        let current = all
            .iter()
            .find(|entry| entry.id == preset_id)
            .unwrap()
            .clone();

        let updated = crate::services::presets::update(
            &engine.pool,
            preset_id,
            &crate::models::PresetInput {
                name: current.name.clone(),
                focus_sec: 40 * 60,
                short_break_sec: current.short_break_sec,
                long_break_sec: current.long_break_sec,
                long_break_every: current.long_break_every,
            },
        )
        .await
        .unwrap();

        engine.apply_preset_edit(&updated).await.unwrap();

        let after = engine.snapshot().await;
        assert_eq!(after.total_ms, before.total_ms);
        assert_eq!(after.status, TimerStatus::Running);
    }

    #[tokio::test]
    async fn crash_recovery_brings_a_running_session_back_paused() {
        let pool = crate::db::memory_pool().await;
        let host = RecordingHost::new();

        {
            let engine = engine_with(&pool, host.clone()).await;
            engine.start().await.unwrap();
        }

        // A new engine simulates the app being reopened.
        let restarted = engine_with(&pool, host).await;
        let snapshot = restarted.snapshot().await;

        assert_eq!(snapshot.status, TimerStatus::Paused);
        assert!(snapshot.remaining_ms > 0);
        assert!(snapshot.remaining_ms <= snapshot.total_ms);
    }
}
