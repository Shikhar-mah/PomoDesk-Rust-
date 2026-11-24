//! Subtask commands.

use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;
use crate::models::{Subtask, SubtaskInput};
use crate::services;
use crate::state::AppState;

fn announce(app: &AppHandle) {
    if let Err(error) = app.emit("tasks:changed", serde_json::json!(null)) {
        eprintln!("[pomodesk] could not announce task change: {error:?}");
    }
}

#[tauri::command]
pub async fn create_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: i64,
    input: SubtaskInput,
) -> Result<Subtask, AppError> {
    let created = services::subtasks::create(&state.pool, task_id, &input).await?;
    announce(&app);
    Ok(created)
}

#[tauri::command]
pub async fn update_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    input: SubtaskInput,
) -> Result<Subtask, AppError> {
    let updated = services::subtasks::update(&state.pool, id, &input).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn set_subtask_done(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    done: bool,
) -> Result<Subtask, AppError> {
    let updated = services::subtasks::set_done(&state.pool, id, done).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), AppError> {
    services::subtasks::delete(&state.pool, id).await?;
    announce(&app);
    Ok(())
}

#[tauri::command]
pub async fn set_active_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Option<i64>,
) -> Result<(), AppError> {
    services::subtasks::set_active(&state.pool, id).await?;
    announce(&app);
    Ok(())
}