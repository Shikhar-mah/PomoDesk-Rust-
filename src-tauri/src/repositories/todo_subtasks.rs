//! All SQL for To-do checklist items (single level).

use sqlx::SqliteConnection;

use crate::error::AppError;
use crate::models::TodoSubtaskRow;

pub async fn list_all(conn: &mut SqliteConnection) -> Result<Vec<TodoSubtaskRow>, AppError> {
    let rows = sqlx::query_as::<_, TodoSubtaskRow>(
        "SELECT id, todo_id, title, is_done, sort_order, created_at, completed_at
         FROM todo_subtasks
         ORDER BY todo_id, sort_order, id",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> Result<TodoSubtaskRow, AppError> {
    let row = sqlx::query_as::<_, TodoSubtaskRow>(
        "SELECT id, todo_id, title, is_done, sort_order, created_at, completed_at
         FROM todo_subtasks WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;

    row.ok_or_else(|| AppError::not_found("That checklist item no longer exists."))
}

pub async fn insert(
    conn: &mut SqliteConnection,
    todo_id: i64,
    title: &str,
) -> Result<TodoSubtaskRow, AppError> {
    let next_sort: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_subtasks WHERE todo_id = ?",
    )
    .bind(todo_id)
    .fetch_one(&mut *conn)
    .await?;

    let id = sqlx::query(
        "INSERT INTO todo_subtasks (todo_id, title, sort_order) VALUES (?, ?, ?)",
    )
    .bind(todo_id)
    .bind(title)
    .bind(next_sort)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();

    get(conn, id).await
}

pub async fn update_title(
    conn: &mut SqliteConnection,
    id: i64,
    title: &str,
) -> Result<TodoSubtaskRow, AppError> {
    let affected = sqlx::query("UPDATE todo_subtasks SET title = ? WHERE id = ?")
        .bind(title)
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found(
            "That checklist item no longer exists.",
        ));
    }
    get(conn, id).await
}

pub async fn set_done(
    conn: &mut SqliteConnection,
    id: i64,
    done: bool,
    completed_at: Option<String>,
) -> Result<TodoSubtaskRow, AppError> {
    let affected =
        sqlx::query("UPDATE todo_subtasks SET is_done = ?, completed_at = ? WHERE id = ?")
            .bind(done)
            .bind(completed_at)
            .bind(id)
            .execute(&mut *conn)
            .await?
            .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found(
            "That checklist item no longer exists.",
        ));
    }
    get(conn, id).await
}

pub async fn delete(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    let affected = sqlx::query("DELETE FROM todo_subtasks WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found(
            "That checklist item no longer exists.",
        ));
    }
    Ok(())
}
