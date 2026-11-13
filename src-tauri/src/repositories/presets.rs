//! All SQL for timer presets.

use sqlx::SqliteConnection;

use crate::error::AppError;
use crate::models::{Preset, PresetInput};

pub async fn list(conn: &mut SqliteConnection) -> Result<Vec<Preset>, AppError> {
    let rows = sqlx::query_as::<_, Preset>(
        "SELECT id, name, focus_sec, short_break_sec, long_break_sec,
                long_break_every, sort_order, is_builtin
         FROM presets
         ORDER BY sort_order, id",
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn get(conn: &mut SqliteConnection, id: i64) -> Result<Preset, AppError> {
    let row = sqlx::query_as::<_, Preset>(
        "SELECT id, name, focus_sec, short_break_sec, long_break_sec,
                long_break_every, sort_order, is_builtin
         FROM presets WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await?;

    row.ok_or_else(|| AppError::not_found("That timer preset no longer exists."))
}

pub async fn count(conn: &mut SqliteConnection) -> Result<i64, AppError> {
    let total = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM presets")
        .fetch_one(&mut *conn)
        .await?;
    Ok(total)
}

/// Adds a preset at the end of the tab list.
pub async fn insert(
    conn: &mut SqliteConnection,
    input: &PresetInput,
    is_builtin: bool,
) -> Result<Preset, AppError> {
    let next_sort: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM presets")
            .fetch_one(&mut *conn)
            .await?;

    let id = sqlx::query(
        "INSERT INTO presets
            (name, focus_sec, short_break_sec, long_break_sec, long_break_every, sort_order, is_builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.name)
    .bind(input.focus_sec)
    .bind(input.short_break_sec)
    .bind(input.long_break_sec)
    .bind(input.long_break_every)
    .bind(next_sort)
    .bind(is_builtin)
    .execute(&mut *conn)
    .await?
    .last_insert_rowid();

    get(conn, id).await
}

pub async fn update(
    conn: &mut SqliteConnection,
    id: i64,
    input: &PresetInput,
) -> Result<Preset, AppError> {
    let affected = sqlx::query(
        "UPDATE presets
         SET name = ?, focus_sec = ?, short_break_sec = ?, long_break_sec = ?, long_break_every = ?
         WHERE id = ?",
    )
    .bind(&input.name)
    .bind(input.focus_sec)
    .bind(input.short_break_sec)
    .bind(input.long_break_sec)
    .bind(input.long_break_every)
    .bind(id)
    .execute(&mut *conn)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That timer preset no longer exists."));
    }

    get(conn, id).await
}

pub async fn delete(conn: &mut SqliteConnection, id: i64) -> Result<(), AppError> {
    let affected = sqlx::query("DELETE FROM presets WHERE id = ?")
        .bind(id)
        .execute(&mut *conn)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::not_found("That timer preset no longer exists."));
    }
    Ok(())
}
