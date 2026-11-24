//! Timer commands. Each one delegates to the engine, which owns the state.

use tauri::State;

use crate::error::AppError;
use crate::models::{SessionType, TimerSnapshot};
use crate::state::AppState;

#[tauri::command]
pub async fn get_timer_state(state: State<'_, AppState>) -> Result<TimerSnapshot, AppError> {
    Ok(state.timer.snapshot().await)
}

#[tauri::command]
pub async fn start_timer(state: State<'_, AppState>) -> Result<TimerSnapshot, AppError> {
    state.timer.start().await
}

#[tauri::command]
pub async fn pause_timer(state: State<'_, AppState>) -> Result<TimerSnapshot, AppError> {
    state.timer.pause().await
}

#[tauri::command]
pub async fn resume_timer(state: State<'_, AppState>) -> Result<TimerSnapshot, AppError> {
    state.timer.resume().await
}

#[tauri::command]
pub async fn skip_session(state: State<'_, AppState>) -> Result<TimerSnapshot, AppError> {
    state.timer.skip().await
}

#[tauri::command]
pub async fn reset_session(state: State<'_, AppState>) -> Result<TimerSnapshot, AppError> {
    state.timer.reset().await
}

#[tauri::command]
pub async fn end_session(state: State<'_, AppState>) -> Result<TimerSnapshot, AppError> {
    state.timer.end_session().await
}

/// `force = false` returns a NEEDS_CONFIRMATION error while a focus session is
/// in progress; the frontend asks the user and then calls again with `true`.
#[tauri::command]
pub async fn switch_session_type(
    state: State<'_, AppState>,
    session_type: SessionType,
    force: bool,
) -> Result<TimerSnapshot, AppError> {
    state.timer.switch_session_type(session_type, force).await
}

/// `force = false` returns a NEEDS_CONFIRMATION error while a focus session is
/// in progress; the frontend asks the user and then calls again with `true`.
#[tauri::command]
pub async fn switch_preset(
    state: State<'_, AppState>,
    preset_id: i64,
    force: bool,
) -> Result<TimerSnapshot, AppError> {
    state.timer.switch_preset(preset_id, force).await
}
