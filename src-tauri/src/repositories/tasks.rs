//! All SQL for tasks.

use sqlx::SqliteConnection;

use crate::error::AppError;
use crate::models::{TaskInput, TaskRow};

/// Open tasks first, then completed ones, each in insertion order.
pub async fn list(conn: &mut SqliteConnection) -> Result<Vec<TaskRow>, AppError> {
    let rows = sqlx::query_as::<_, TaskRow>(
        "SELECT id, title, note, est_slots, completed_slots, is_done,
                sort_order, created_at, completed_at
         FROM tasks
         ORDER BY is_done, sort_order, id",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> Result<TaskRow, AppError> {
    let row = sqlx::query_as::<_, TaskRow>(
        "SELECT id, title, note, est_slots, completed_slots, is_done,
                sort_order, created_at, completed_at
         FROM tasks WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;

    row.ok_or_else(|| AppError::not_found("That task no longer exists."))
}

pub async fn insert(conn: &mut SqliteConnection, input: &TaskInput) -> Result<TaskRow, AppError> {
    let next_sort: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks")
        .fetch_one(&mut *conn)
        .await?;

    let id = sqlx::query(
        "INSERT INTO tasks (title, note, est_slots, completed_slots, is_done, sort_order)
         VALUES (?, ?, ?, 0, 0, ?)",
    )
    .bind(&input.title)
    .bind(&input.note)
    .bind(input.est_slots)
    .bind(next_sort)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();

    get(conn, id).await
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: i64,
    input: &TaskInput,
) -> Result<TaskRow, AppError> {
    let affected = sqlx::query("UPDATE tasks SET title = ?, note = ?, est_slots = ? WHERE id = ?")
        .bind(&input.title)
        .bind(&input.note)
        .bind(input.est_slots)
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That task no longer exists."));
    }

    get(conn, id).await
}

/// Marks a task done (stamping `completed_at`) or re-opens it (clearing it).
pub async fn set_done(
    conn: &mut SqliteConnection,
    id: i64,
    done: bool,
    completed_at: Option<String>,
) -> Result<TaskRow, AppError> {
    let affected = sqlx::query("UPDATE tasks SET is_done = ?, completed_at = ? WHERE id = ?")
        .bind(done)
        .bind(completed_at)
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That task no longer exists."));
    }

    get(conn, id).await
}

pub async fn delete(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    let affected = sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That task no longer exists."));
    }
    Ok(())
}

/// Adds one completed pomodoro to a task. This is only ever called after a focus
/// session finishes, so skipped or discarded sessions cannot inflate the count.
pub async fn credit_slot(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    sqlx::query("UPDATE tasks SET completed_slots = completed_slots + 1 WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// How many tasks were marked done on a given local day (`YYYY-MM-DD`).
pub async fn count_completed_on(conn: &mut SqliteConnection, day: &str) -> Result<i64, AppError> {
    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM tasks
         WHERE is_done = 1 AND date(completed_at, 'localtime') = ?",
    )
    .bind(day)
    .fetch_one(&mut *conn)
    .await?;
    Ok(total)
}
