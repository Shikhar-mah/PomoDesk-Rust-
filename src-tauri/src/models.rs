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
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub note: String,
    pub est_slots: i64,
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
    pub notifications_enabled: bool,
    pub minimize_to_tray: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_start_breaks: true,
            auto_start_focus: false,
            sound_enabled: true,
            notifications_enabled: true,
            minimize_to_tray: true,
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
