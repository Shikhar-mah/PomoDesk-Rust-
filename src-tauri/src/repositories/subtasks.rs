//! All SQL for subtasks.

use sqlx::SqliteConnection;

use crate::error::AppError;
use crate::models::{SubtaskRow, SubtaskInput};

pub async fn list_all(conn: &mut SqliteConnection) -> Result<Vec<SubtaskRow>, AppError> {
    let rows = sqlx::query_as::<_, SubtaskRow>(
        "SELECT id, task_id, title, est_slots, completed_slots, is_done,\n                sort_order, created_at, completed_at\n         FROM subtasks\n         ORDER BY task_id, sort_order, id",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> Result<SubtaskRow, AppError> {
    let row = sqlx::query_as::<_, SubtaskRow>(
        "SELECT id, task_id, title, est_slots, completed_slots, is_done,\n                sort_order, created_at, completed_at\n         FROM subtasks WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;

    row.ok_or_else(|| AppError::not_found("That subtask no longer exists."))
}

pub async fn insert(
    conn: &mut SqliteConnection,
    task_id: i64,
    input: &SubtaskInput,
) -> Result<SubtaskRow, AppError> {
    let next_sort: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM subtasks WHERE task_id = ?")
            .bind(task_id)
            .fetch_one(&mut *conn)
            .await?;

    let est = if input.est_slots < 1 { 1 } else { input.est_slots };
    let id = sqlx::query(
        "INSERT INTO subtasks (task_id, title, est_slots, completed_slots, is_done, sort_order)\n         VALUES (?, ?, ?, 0, 0, ?)",
    )
    .bind(task_id)
    .bind(&input.title)
    .bind(est)
    .bind(next_sort)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();

    get(conn, id).await
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: i64,
    input: &SubtaskInput,
) -> Result<SubtaskRow, AppError> {
    let est = if input.est_slots < 1 { 1 } else { input.est_slots };
    let affected = sqlx::query(
        "UPDATE subtasks SET title = ?, est_slots = ?,\n                            completed_slots = COALESCE(?, completed_slots)\n         WHERE id = ?",
    )
    .bind(&input.title)
    .bind(est)
    .bind(input.completed_slots)
    .bind(id)
    .execute(&mut *conn)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That subtask no longer exists."));
    }

    get(conn, id).await
}

pub async fn set_done(
    conn: &mut SqliteConnection,
    id: i64,
    done: bool,
    completed_at: Option<String>,
) -> Result<SubtaskRow, AppError> {
    let affected = sqlx::query("UPDATE subtasks SET is_done = ?, completed_at = ? WHERE id = ?")
        .bind(done)
        .bind(completed_at)
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That subtask no longer exists."));
    }

    get(conn, id).await
}

pub async fn delete(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    let affected = sqlx::query("DELETE FROM subtasks WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That subtask no longer exists."));
    }
    Ok(())
}

pub async fn credit_slot(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    sqlx::query("UPDATE subtasks SET completed_slots = completed_slots + 1 WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}