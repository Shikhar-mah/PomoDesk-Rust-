//! The state Tauri shares with every command.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use sqlx::SqlitePool;

use crate::timer::TimerEngine;

pub struct AppState {
    /// The one and only database pool.
    pub pool: SqlitePool,
    /// The always-running timer engine (it keeps ticking with the window closed).
    pub timer: Arc<TimerEngine>,
    /// Mirrors the `minimize_to_tray` setting so the window-close handler does
    /// not need to touch the database on the UI thread.
    pub minimize_to_tray: AtomicBool,
    /// True once the tray icon was created successfully. If it failed we must
    /// keep "close" working normally, otherwise the window could never be quit.
    pub tray_ready: AtomicBool,
}
