//! All SQL for tags and task-tag links.

use sqlx::SqliteConnection;

use crate::error::AppError;

/// Returns `(task_id, tag_name)` for every task that has tags.
pub async fn list_for_tasks(conn: &mut SqliteConnection) -> Result<Vec<(i64, String)>, AppError> {
    let rows = sqlx::query_as::<_, (i64, String)>(
        "SELECT task_tags.task_id, tags.name\n         FROM task_tags\n         JOIN tags ON tags.id = task_tags.tag_id\n         ORDER BY task_tags.task_id, tags.name",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

/// Finds a tag by name (case-insensitive) or creates it. Returns its id.
pub async fn find_or_create(conn: &mut SqliteConnection, name: &str) -> Result<i64, AppError> {
    sqlx::query("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING")
        .bind(name)
        .execute(&mut *conn)
        .await?;

    let id: i64 = sqlx::query_scalar("SELECT id FROM tags WHERE name = ? COLLATE NOCASE")
        .bind(name)
        .fetch_one(&mut *conn)
        .await?;
    Ok(id)
}

/// Replaces the tag set of a task with the given names.
pub async fn replace_for_task(
    conn: &mut SqliteConnection,
    task_id: i64,
    names: &[String],
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM task_tags WHERE task_id = ?")
        .bind(task_id)
        .execute(&mut *conn)
        .await?;

    for name in names {
        let tag_id = find_or_create(conn, name).await?;
        sqlx::query(
            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
        )
        .bind(task_id)
        .bind(tag_id)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// Deletes tags that no task references any more.
pub async fn delete_orphans(conn: &mut SqliteConnection) -> Result<(), AppError> {
    sqlx::query(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM task_tags)",
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}