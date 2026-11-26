//! All SQL for To-do lists.

use sqlx::SqliteConnection;

use crate::error::AppError;
use crate::models::{TodoList, TodoListInput};

pub async fn list(conn: &mut SqliteConnection) -> Result<Vec<TodoList>, AppError> {
    let rows = sqlx::query_as::<_, TodoList>(
        "SELECT id, name, color, icon, sort_order, is_inbox, archived_at, created_at
         FROM todo_lists
         ORDER BY sort_order, id",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> Result<TodoList, AppError> {
    let row = sqlx::query_as::<_, TodoList>(
        "SELECT id, name, color, icon, sort_order, is_inbox, archived_at, created_at
         FROM todo_lists WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;

    row.ok_or_else(|| AppError::not_found("That list no longer exists."))
}

pub async fn inbox(conn: &mut SqliteConnection) -> Result<Option<TodoList>, AppError> {
    let row = sqlx::query_as::<_, TodoList>(
        "SELECT id, name, color, icon, sort_order, is_inbox, archived_at, created_at
         FROM todo_lists WHERE is_inbox = 1 LIMIT 1",
    )
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row)
}

pub async fn insert(
    conn: &mut SqliteConnection,
    input: &TodoListInput,
) -> Result<TodoList, AppError> {
    let next_sort: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_lists")
            .fetch_one(&mut *conn)
            .await?;

    let id = sqlx::query(
        "INSERT INTO todo_lists (name, color, icon, sort_order, is_inbox)
         VALUES (?, ?, ?, ?, 0)",
    )
    .bind(&input.name)
    .bind(&input.color)
    .bind(&input.icon)
    .bind(next_sort)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();

    get(conn, id).await
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: i64,
    input: &TodoListInput,
) -> Result<TodoList, AppError> {
    let affected = sqlx::query(
        "UPDATE todo_lists SET name = ?, color = ?, icon = ? WHERE id = ?",
    )
    .bind(&input.name)
    .bind(&input.color)
    .bind(&input.icon)
    .bind(id)
    .execute(&mut *conn)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That list no longer exists."));
    }

    get(conn, id).await
}

pub async fn set_archived(
    conn: &mut SqliteConnection,
    id: i64,
    archived_at: Option<String>,
) -> Result<TodoList, AppError> {
    let affected = sqlx::query("UPDATE todo_lists SET archived_at = ? WHERE id = ?")
        .bind(archived_at)
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That list no longer exists."));
    }

    get(conn, id).await
}

pub async fn delete(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    let affected = sqlx::query("DELETE FROM todo_lists WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That list no longer exists."));
    }
    Ok(())
}

pub async fn set_sort_order(
    conn: &mut SqliteConnection,
    id: i64,
    sort_order: i64,
) -> Result<(), AppError> {
    sqlx::query("UPDATE todo_lists SET sort_order = ? WHERE id = ?")
        .bind(sort_order)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Inserts the default Inbox if it is ever missing. Idempotent.
pub async fn ensure_inbox(conn: &mut SqliteConnection) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO todo_lists (name, color, icon, sort_order, is_inbox)
         SELECT 'Inbox', 'zinc', 'inbox', 0, 1
         WHERE NOT EXISTS (SELECT 1 FROM todo_lists WHERE is_inbox = 1)",
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}
