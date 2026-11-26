//! Plain data structures shared by the database layer, the services and the
//! React view. Field names are converted to camelCase on the way out so the
//! TypeScript side can use `focusSec` instead of `focus_sec`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Timestamps are stored in this exact shape so SQLite's date functions can
/// group rows by the user's local day.
pub const SQL_TIMESTAMP_FORMAT: &str = "%Y-%m-%d %H:%M:%S";

pub fn now_utc() -> DateTime<Utc> {
    Utc::now()
}

pub fn to_sql_timestamp(value: DateTime<Utc>) -> String {
    value.format(SQL_TIMESTAMP_FORMAT).to_string()
}

pub fn parse_sql_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S %z")
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|_| {
            // Fall back to a strict ISO-8601 timestamp, which keeps older rows
            // readable if the format ever changes.
            DateTime::parse_from_rfc3339(value).map(|dt| dt.with_timezone(&Utc))
        })
        .ok()
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/// A timer configuration ("Classic", "Deep Work", ...).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: i64,
    pub name: String,
    pub focus_sec: i64,
    pub short_break_sec: i64,
    pub long_break_sec: i64,
    pub long_break_every: i64,
    pub sort_order: i64,
    pub is_builtin: bool,
}

/// What the user sends when creating or editing a preset.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetInput {
    pub name: String,
    pub focus_sec: i64,
    pub short_break_sec: i64,
    pub long_break_sec: i64,
    pub long_break_every: i64,
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/// A task row exactly as it is stored.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TaskRow {
    pub id: i64,
    pub title: String,
    pub note: String,
    pub est_slots: i64,
    pub completed_slots: i64,
    pub is_done: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
}

/// The task shape the interface receives. `is_active` is not a database column:
/// it comes from the single `active_task_id` app-state key.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub note: String,
    pub est_slots: i64,
    pub completed_slots: i64,
    pub is_done: bool,
    pub is_active: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub tags: Vec<String>,
    pub subtasks: Vec<Subtask>,
}

impl Task {
    pub fn from_row(row: TaskRow, active_task_id: Option<i64>) -> Self {
        Self {
            id: row.id,
            title: row.title,
            note: row.note,
            est_slots: row.est_slots,
            completed_slots: row.completed_slots,
            is_done: row.is_done,
            is_active: active_task_id == Some(row.id),
            created_at: row.created_at,
            completed_at: row.completed_at,
            tags: Vec::new(),
            subtasks: Vec::new(),
        }
    }
}

/// A subtask row exactly as it is stored.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SubtaskRow {
    pub id: i64,
    pub task_id: i64,
    pub title: String,
    pub est_slots: i64,
    pub completed_slots: i64,
    pub is_done: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
}

/// The subtask shape the interface receives.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Subtask {
    pub id: i64,
    pub task_id: i64,
    pub title: String,
    pub est_slots: i64,
    pub completed_slots: i64,
    pub is_done: bool,
    pub is_active: bool,
    pub created_at: String,
    pub completed_at: Option<String>,
}

impl Subtask {
    pub fn from_row(row: SubtaskRow, active_subtask_id: Option<i64>) -> Self {
        Self {
            id: row.id,
            task_id: row.task_id,
            title: row.title,
            est_slots: row.est_slots,
            completed_slots: row.completed_slots,
            is_done: row.is_done,
            is_active: active_subtask_id == Some(row.id),
            created_at: row.created_at,
            completed_at: row.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskInput {
    pub title: String,
    #[serde(default = "default_est_slots")]
    pub est_slots: i64,
    /// `None` means "leave the completed count untouched".
    #[serde(default)]
    pub completed_slots: Option<i64>,
}

fn default_est_slots() -> i64 {
    1
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub note: String,
    pub est_slots: i64,
    /// `None` means "leave the completed count untouched" (used by quick-add
    /// and by any caller that only edits the title/estimate).
    #[serde(default)]
    pub completed_slots: Option<i64>,
    #[serde(default)]
    pub tags: Vec<String>,
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionType {
    Focus,
    ShortBreak,
    LongBreak,
}

impl SessionType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Focus => "focus",
            Self::ShortBreak => "short_break",
            Self::LongBreak => "long_break",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Focus => "Focus",
            Self::ShortBreak => "Short Break",
            Self::LongBreak => "Long Break",
        }
    }

    pub fn is_break(self) -> bool {
        !matches!(self, Self::Focus)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
}

/// Everything the interface (and crash recovery) needs to know about the timer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    pub session_type: SessionType,
    pub status: TimerStatus,
    pub remaining_ms: i64,
    pub total_ms: i64,
    /// Absolute wall-clock deadline in Unix milliseconds. `None` when not running.
    pub ends_at: Option<i64>,
    pub started_at: Option<String>,
    pub cycle_focus_count: i64,
    pub active_preset_id: i64,
}

/// Emitted every 250 ms while the timer runs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickPayload {
    pub session_type: SessionType,
    pub status: TimerStatus,
    pub remaining_ms: i64,
    pub total_ms: i64,
    pub cycle_focus_count: i64,
    pub active_preset_id: i64,
}

/// Emitted once when a focus session or a break reaches zero.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompletePayload {
    pub completed_type: SessionType,
    pub next_type: SessionType,
    pub credited_task_id: Option<i64>,
    pub will_auto_start: bool,
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub auto_start_breaks: bool,
    pub auto_start_focus: bool,
    pub sound_enabled: bool,
    /// File name stem of the bundled sound; empty means the default.
    pub sound_id: String,
    pub notifications_enabled: bool,
    pub pomodoro_notifications: bool,
    pub todo_reminders_enabled: bool,
    pub minimize_to_tray: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_start_breaks: true,
            auto_start_focus: false,
            sound_enabled: true,
            sound_id: String::new(),
            notifications_enabled: true,
            pomodoro_notifications: true,
            todo_reminders_enabled: true,
            minimize_to_tray: true,
        }
    }
}

// ---------------------------------------------------------------------------
// To-do lists (independent of Pomodoro tasks)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TodoList {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub sort_order: i64,
    pub is_inbox: bool,
    pub archived_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoListInput {
    pub name: String,
    #[serde(default = "default_list_color")]
    pub color: String,
    #[serde(default = "default_list_icon")]
    pub icon: String,
}

fn default_list_color() -> String {
    "zinc".to_string()
}

fn default_list_icon() -> String {
    "list".to_string()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, Default)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
pub enum Priority {
    Low,
    #[default]
    Medium,
    High,
}

impl Priority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "low" => Some(Self::Low),
            "medium" => Some(Self::Medium),
            "high" => Some(Self::High),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoReminder {
    pub fire_at: String,
    pub kind: String,
    pub lead_minutes: Option<i64>,
    pub fired_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoSubtask {
    pub id: i64,
    pub todo_id: i64,
    pub title: String,
    pub is_done: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: i64,
    pub list_id: i64,
    pub title: String,
    pub note: String,
    pub is_done: bool,
    pub priority: Priority,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub subtasks: Vec<TodoSubtask>,
    pub reminder: Option<TodoReminder>,
}

/// A To-do row exactly as stored. The interface shape is [`Todo`].
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TodoRow {
    pub id: i64,
    pub list_id: i64,
    pub title: String,
    pub note: String,
    pub is_done: bool,
    pub priority: String,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TodoSubtaskRow {
    pub id: i64,
    pub todo_id: i64,
    pub title: String,
    pub is_done: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub completed_at: Option<String>,
}

impl From<TodoSubtaskRow> for TodoSubtask {
    fn from(row: TodoSubtaskRow) -> Self {
        Self {
            id: row.id,
            todo_id: row.todo_id,
            title: row.title,
            is_done: row.is_done,
            sort_order: row.sort_order,
            created_at: row.created_at,
            completed_at: row.completed_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum ReminderInput {
    Due,
    Before { lead_minutes: i64 },
    Custom { at: String },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoInput {
    pub title: String,
    #[serde(default)]
    pub note: String,
    pub list_id: i64,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub due_time: Option<String>,
    #[serde(default)]
    pub reminder: Option<ReminderInput>,
}

/// One pending reminder, joined with the task it belongs to, for the scheduler.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DueReminder {
    pub id: i64,
    pub todo_id: i64,
    pub fire_at: String,
    pub kind: String,
    pub lead_minutes: Option<i64>,
    pub title: String,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub is_done: bool,
    pub archived_at: Option<String>,
    pub list_name: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TodoReminderRow {
    pub id: i64,
    pub todo_id: i64,
    pub fire_at: String,
    pub kind: String,
    pub lead_minutes: Option<i64>,
    pub fired_at: Option<String>,
}

impl From<TodoReminderRow> for TodoReminder {
    fn from(row: TodoReminderRow) -> Self {
        Self {
            fire_at: row.fire_at,
            kind: row.kind,
            lead_minutes: row.lead_minutes,
            fired_at: row.fired_at,
        }
    }
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsToday {
    pub sessions: i64,
    pub focus_minutes: i64,
    pub tasks_completed: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStat {
    /// Local calendar day, `YYYY-MM-DD`.
    pub date: String,
    pub sessions: i64,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsTotals {
    pub sessions: i64,
    pub focus_minutes: i64,
    pub streak_days: i64,
}
