//! Task commands.

use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;
use crate::models::{Task, TaskInput};
use crate::services;
use crate::state::AppState;

fn announce(app: &AppHandle) {
    if let Err(error) = app.emit("tasks:changed", serde_json::json!(null)) {
        eprintln!("[pomodesk] could not announce task change: {error:?}");
    }
}

#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, AppError> {
    services::tasks::list(&state.pool).await
}

#[tauri::command]
pub async fn create_task(
    app: AppHandle,
    state: State<'_, AppState>,
    input: TaskInput,
) -> Result<Task, AppError> {
    let created = services::tasks::create(&state.pool, &input).await?;
    announce(&app);
    Ok(created)
}

#[tauri::command]
pub async fn update_task(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    input: TaskInput,
) -> Result<Task, AppError> {
    let updated = services::tasks::update(&state.pool, id, &input).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn set_task_done(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    done: bool,
) -> Result<Task, AppError> {
    let updated = services::tasks::set_done(&state.pool, id, done).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_task(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), AppError> {
    services::tasks::delete(&state.pool, id).await?;
    announce(&app);
    Ok(())
}

#[tauri::command]
pub async fn set_active_task(
    app: AppHandle,
    state: State<'_, AppState>,
    id: Option<i64>,
) -> Result<Option<i64>, AppError> {
    let active = services::tasks::set_active(&state.pool, id).await?;
    announce(&app);
    Ok(active)
}
