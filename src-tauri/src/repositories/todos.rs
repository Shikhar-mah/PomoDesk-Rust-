//! All SQL for To-do tasks.

use sqlx::SqliteConnection;

use crate::error::AppError;
use crate::models::TodoRow;

pub async fn list_all(conn: &mut SqliteConnection) -> Result<Vec<TodoRow>, AppError> {
    let rows = sqlx::query_as::<_, TodoRow>(
        "SELECT id, list_id, title, note, is_done, priority, due_date, due_time,
                sort_order, created_at, completed_at
         FROM todos
         ORDER BY list_id, is_done, sort_order, id",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> Result<TodoRow, AppError> {
    let row = sqlx::query_as::<_, TodoRow>(
        "SELECT id, list_id, title, note, is_done, priority, due_date, due_time,
                sort_order, created_at, completed_at
         FROM todos WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;

    row.ok_or_else(|| AppError::not_found("That To-do task no longer exists."))
}

pub struct NewTodo<'a> {
    pub list_id: i64,
    pub title: &'a str,
    pub note: &'a str,
    pub priority: &'a str,
    pub due_date: Option<&'a str>,
    pub due_time: Option<&'a str>,
}

pub async fn insert(conn: &mut SqliteConnection, input: &NewTodo<'_>) -> Result<TodoRow, AppError> {
    let next_sort: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todos WHERE list_id = ?",
    )
    .bind(input.list_id)
    .fetch_one(&mut *conn)
    .await?;

    let id = sqlx::query(
        "INSERT INTO todos (list_id, title, note, priority, due_date, due_time, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(input.list_id)
    .bind(input.title)
    .bind(input.note)
    .bind(input.priority)
    .bind(input.due_date)
    .bind(input.due_time)
    .bind(next_sort)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();

    get(conn, id).await
}

pub struct TodoUpdate<'a> {
    pub list_id: i64,
    pub title: &'a str,
    pub note: &'a str,
    pub priority: &'a str,
    pub due_date: Option<&'a str>,
    pub due_time: Option<&'a str>,
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: i64,
    input: &TodoUpdate<'_>,
) -> Result<TodoRow, AppError> {
    let affected = sqlx::query(
        "UPDATE todos
         SET list_id = ?, title = ?, note = ?, priority = ?, due_date = ?, due_time = ?
         WHERE id = ?",
    )
    .bind(input.list_id)
    .bind(input.title)
    .bind(input.note)
    .bind(input.priority)
    .bind(input.due_date)
    .bind(input.due_time)
    .bind(id)
    .execute(&mut *conn)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That To-do task no longer exists."));
    }

    get(conn, id).await
}

pub async fn set_done(
    conn: &mut SqliteConnection,
    id: i64,
    done: bool,
    completed_at: Option<String>,
) -> Result<TodoRow, AppError> {
    let affected = sqlx::query("UPDATE todos SET is_done = ?, completed_at = ? WHERE id = ?")
        .bind(done)
        .bind(completed_at)
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That To-do task no longer exists."));
    }

    get(conn, id).await
}

pub async fn delete(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    let affected = sqlx::query("DELETE FROM todos WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That To-do task no longer exists."));
    }
    Ok(())
}

pub async fn set_sort_order(
    conn: &mut SqliteConnection,
    id: i64,
    sort_order: i64,
) -> Result<(), AppError> {
    sqlx::query("UPDATE todos SET sort_order = ? WHERE id = ?")
        .bind(sort_order)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Moves every task of a list into another list, keeping their order.
pub async fn move_list(
    conn: &mut SqliteConnection,
    from_list_id: i64,
    to_list_id: i64,
) -> Result<(), AppError> {
    sqlx::query("UPDATE todos SET list_id = ? WHERE list_id = ?")
        .bind(to_list_id)
        .bind(from_list_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// Ids of a list's tasks in their current manual order.
pub async fn ids_in_list(
    conn: &mut SqliteConnection,
    list_id: i64,
) -> Result<Vec<i64>, AppError> {
    let ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM todos WHERE list_id = ? ORDER BY sort_order, id",
    )
    .bind(list_id)
    .fetch_all(&mut *conn)
    .await?;
    Ok(ids)
}
