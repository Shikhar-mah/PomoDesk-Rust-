//! All SQL for the completed-focus-session log and the statistics built on it.
//!
//! Only successful focus sessions are written here, so a row always means
//! "one pomodoro that counted".

use sqlx::{FromRow, SqliteConnection};

use crate::error::AppError;

pub struct NewSession {
    pub preset_id: Option<i64>,
    pub preset_name: String,
    pub task_id: Option<i64>,
    pub task_title: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub duration_sec: i64,
}

/// Rows are grouped by the user's *local* day, which is why the queries use
/// `date(started_at, 'localtime')`.
#[derive(Debug, FromRow)]
pub struct DayTotals {
    pub day: String,
    pub sessions: i64,
    pub seconds: i64,
}

#[derive(Debug, FromRow)]
pub struct Totals {
    pub sessions: i64,
    pub seconds: i64,
}

pub async fn insert(conn: &mut SqliteConnection, session: &NewSession) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO sessions
            (preset_id, preset_name, task_id, task_title, started_at, ended_at, duration_sec)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(session.preset_id)
    .bind(&session.preset_name)
    .bind(session.task_id)
    .bind(&session.task_title)
    .bind(&session.started_at)
    .bind(&session.ended_at)
    .bind(session.duration_sec)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn totals_for_today(conn: &mut SqliteConnection) -> Result<Totals, AppError> {
    let row = sqlx::query_as::<_, Totals>(
        "SELECT COUNT(*) AS sessions, COALESCE(SUM(duration_sec), 0) AS seconds
         FROM sessions
         WHERE date(started_at, 'localtime') = date('now', 'localtime')",
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(row)
}

pub async fn totals_all_time(conn: &mut SqliteConnection) -> Result<Totals, AppError> {
    let row = sqlx::query_as::<_, Totals>(
        "SELECT COUNT(*) AS sessions, COALESCE(SUM(duration_sec), 0) AS seconds FROM sessions",
    )
    .fetch_one(&mut *conn)
    .await?;
    Ok(row)
}

/// Totals for the last `days` local days, including days with no sessions
/// (the caller fills the gaps).
pub async fn totals_per_day(
    conn: &mut SqliteConnection,
    days: i64,
) -> Result<Vec<DayTotals>, AppError> {
    let offset = format!("-{} days", (days - 1).max(0));
    let rows = sqlx::query_as::<_, DayTotals>(
        "SELECT date(started_at, 'localtime') AS day,
                COUNT(*) AS sessions,
                COALESCE(SUM(duration_sec), 0) AS seconds
         FROM sessions
         WHERE date(started_at, 'localtime') >= date('now', 'localtime', ?)
         GROUP BY day
         ORDER BY day",
    )
    .bind(offset)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

/// Distinct local days that contain at least one completed focus session,
/// newest first. Used to calculate the streak.
pub async fn distinct_days(conn: &mut SqliteConnection) -> Result<Vec<String>, AppError> {
    let rows = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT date(started_at, 'localtime') AS day
         FROM sessions
         ORDER BY day DESC",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}
