//! Small key/value table used for anything that is not a list: the active task,
//! the active preset, the cycle counter, the crash-recovery snapshot and the
//! settings JSON.

use sqlx::SqliteConnection;

use crate::error::AppError;

// The keys are constants so a typo becomes a compile error instead of a bug.
pub const ACTIVE_TASK_ID: &str = "active_task_id";
pub const ACTIVE_PRESET_ID: &str = "active_preset_id";
pub const CYCLE_FOCUS_COUNT: &str = "cycle_focus_count";
pub const TIMER_SNAPSHOT: &str = "timer_snapshot";
pub const SETTINGS: &str = "settings";

pub async fn get(conn: &mut SqliteConnection, key: &str) -> Result<Option<String>, AppError> {
    let value = sqlx::query_scalar::<_, String>("SELECT value FROM app_state WHERE key = ?")
        .bind(key)
        .fetch_optional(&mut *conn)
        .await?;
    Ok(value)
}

/// Inserts the key, or overwrites it when it already exists.
pub async fn set(conn: &mut SqliteConnection, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO app_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn remove(conn: &mut SqliteConnection, key: &str) -> Result<(), AppError> {
    sqlx::query("DELETE FROM app_state WHERE key = ?")
        .bind(key)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

pub async fn get_i64(conn: &mut SqliteConnection, key: &str) -> Result<Option<i64>, AppError> {
    let raw = get(conn, key).await?;
    Ok(raw.and_then(|value| value.parse::<i64>().ok()))
}

pub async fn set_i64(conn: &mut SqliteConnection, key: &str, value: i64) -> Result<(), AppError> {
    set(conn, key, &value.to_string()).await
}
