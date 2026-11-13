//! Opening and preparing the single local SQLite database.
//!
//! This module is the only place that knows where the file lives and which
//! options the connection needs. Everything else receives a ready pool.

use std::fs;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// Name of the database file inside the OS app-data folder.
const DB_FILE: &str = "pomodesk.db";

/// The four presets every fresh install starts with.
/// (name, focus, short break, long break, long break every N focus sessions)
const DEFAULT_PRESETS: [(&str, i64, i64, i64, i64); 4] = [
    ("Classic", 25 * 60, 5 * 60, 15 * 60, 4),
    ("Deep Work", 50 * 60, 10 * 60, 25 * 60, 2),
    ("Quick Sprint", 15 * 60, 3 * 60, 10 * 60, 4),
    ("Study", 45 * 60, 15 * 60, 30 * 60, 3),
];

/// Creates (if needed) and migrates the database, then seeds the default presets.
pub async fn init(app: &AppHandle) -> Result<SqlitePool, AppError> {
    let data_dir = app.path().app_data_dir().map_err(|error| {
        eprintln!("[pomodesk] app data dir unavailable: {error:?}");
        AppError::internal("PomoDesk could not find a folder to save your data in.")
    })?;

    fs::create_dir_all(&data_dir).map_err(|error| {
        eprintln!("[pomodesk] could not create data dir: {error:?}");
        AppError::internal(
            "PomoDesk could not create its data folder. Check that the folder is writable.",
        )
    })?;

    let pool = connect(&data_dir.join(DB_FILE)).await?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|error| {
            eprintln!("[pomodesk] migration failed: {error:?}");
            AppError::internal("PomoDesk could not prepare its local database.")
        })?;

    seed_default_presets(&pool).await?;

    Ok(pool)
}

/// Opens a database file with the settings PomoDesk relies on.
async fn connect(path: &std::path::Path) -> Result<SqlitePool, AppError> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        // WAL keeps reads fast while the timer writes its snapshot.
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        // Foreign keys are OFF by default in SQLite; we need them ON.
        .foreign_keys(true)
        // If another statement is busy, wait briefly instead of failing.
        .busy_timeout(Duration::from_secs(5));

    SqlitePoolOptions::new()
        // One connection keeps every write strictly ordered. This app is small
        // enough that a single serialised connection is simpler and safer than
        // juggling concurrent writers.
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await
        .map_err(|error| {
            eprintln!("[pomodesk] could not open database: {error:?}");
            AppError::internal("PomoDesk could not open its local database.")
        })
}

/// Inserts the built-in presets once, on the very first launch.
async fn seed_default_presets(pool: &SqlitePool) -> Result<(), AppError> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM presets")
        .fetch_one(pool)
        .await?;

    if existing > 0 {
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    for (index, (name, focus, short, long, every)) in DEFAULT_PRESETS.iter().enumerate() {
        sqlx::query(
            "INSERT INTO presets
                (name, focus_sec, short_break_sec, long_break_sec, long_break_every, sort_order, is_builtin)
             VALUES (?, ?, ?, ?, ?, ?, 1)",
        )
        .bind(name)
        .bind(focus)
        .bind(short)
        .bind(long)
        .bind(every)
        .bind(index as i64)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    Ok(())
}

/// A throw-away database used by the Rust tests.
///
/// SQLite's `:memory:` database lives inside one connection, which is exactly
/// what our single-connection pool gives us.
#[cfg(test)]
pub async fn memory_pool() -> SqlitePool {
    let options = SqliteConnectOptions::new()
        .filename(":memory:")
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .expect("in-memory sqlite should open");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations should apply");

    seed_default_presets(&pool)
        .await
        .expect("default presets should seed");

    pool
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn seeding_is_idempotent() {
        let pool = memory_pool().await;

        // Running the seeder again must not duplicate the built-in presets.
        seed_default_presets(&pool).await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM presets")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(count, 4);
    }

    #[tokio::test]
    async fn foreign_keys_are_enforced() {
        let pool = memory_pool().await;

        // A session pointing at a preset that does not exist must be rejected.
        let result = sqlx::query(
            "INSERT INTO sessions (preset_id, preset_name, started_at, ended_at, duration_sec)
             VALUES (9999, 'Ghost', '2026-01-01 10:00:00', '2026-01-01 10:25:00', 1500)",
        )
        .execute(&pool)
        .await;

        assert!(
            result.is_err(),
            "foreign key should reject an unknown preset"
        );
    }
}
