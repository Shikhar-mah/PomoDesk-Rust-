//! All SQL for To-do reminders. One reminder per task.

use sqlx::SqliteConnection;

use crate::error::AppError;
use crate::models::{DueReminder, TodoReminderRow};

pub async fn list_all(
    conn: &mut SqliteConnection,
) -> Result<Vec<TodoReminderRow>, AppError> {
    let rows = sqlx::query_as::<_, TodoReminderRow>(
        "SELECT id, todo_id, fire_at, kind, lead_minutes, fired_at
         FROM todo_reminders",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn get_for_todo(
    conn: &mut SqliteConnection,
    todo_id: i64,
) -> Result<Option<TodoReminderRow>, AppError> {
    let row = sqlx::query_as::<_, TodoReminderRow>(
        "SELECT id, todo_id, fire_at, kind, lead_minutes, fired_at
         FROM todo_reminders WHERE todo_id = ?",
    )
    .bind(todo_id)
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row)
}

pub async fn upsert(
    conn: &mut SqliteConnection,
    todo_id: i64,
    fire_at: &str,
    kind: &str,
    lead_minutes: Option<i64>,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO todo_reminders (todo_id, fire_at, kind, lead_minutes, fired_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(todo_id) DO UPDATE SET
             fire_at = excluded.fire_at,
             kind = excluded.kind,
             lead_minutes = excluded.lead_minutes,
             fired_at = NULL",
    )
    .bind(todo_id)
    .bind(fire_at)
    .bind(kind)
    .bind(lead_minutes)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn delete_for_todo(
    conn: &mut SqliteConnection,
    todo_id: i64,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM todo_reminders WHERE todo_id = ?")
        .bind(todo_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Pending reminders that are due, joined with the owning task and list.
pub async fn pending_due(
    conn: &mut SqliteConnection,
    now: &str,
) -> Result<Vec<DueReminder>, AppError> {
    let rows = sqlx::query_as::<_, DueReminder>(
        "SELECT r.id, r.todo_id, r.fire_at, r.kind, r.lead_minutes,
                t.title, t.due_date, t.due_time, t.is_done, l.archived_at, l.name AS list_name
         FROM todo_reminders r
         JOIN todos t ON t.id = r.todo_id
         JOIN todo_lists l ON l.id = t.list_id
         WHERE r.fired_at IS NULL AND r.fire_at <= ?
         ORDER BY r.fire_at
         LIMIT 50",
    )
    .bind(now)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

/// Claims a reminder before showing it. `true` means this call owns the toast.
pub async fn mark_fired(
    conn: &mut SqliteConnection,
    id: i64,
    fired_at: &str,
) -> Result<bool, AppError> {
    let affected = sqlx::query(
        "UPDATE todo_reminders SET fired_at = ? WHERE id = ? AND fired_at IS NULL",
    )
    .bind(fired_at)
    .bind(id)
    .execute(&mut *conn)
    .await?
    .rows_affected();
    Ok(affected == 1)
}

/// Pushes a reminder's fire time out and re-arms it.
pub async fn snooze(
    conn: &mut SqliteConnection,
    todo_id: i64,
    fire_at: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE todo_reminders SET fire_at = ?, fired_at = NULL WHERE todo_id = ?",
    )
    .bind(fire_at)
    .bind(todo_id)
    .execute(&mut *conn)
    .await?;
    Ok(())
}
