//! To-do commands: the thin Tauri boundary over `services::todos`.

use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;
use crate::models::{Todo, TodoInput, TodoList, TodoListInput, TodoSubtask};
use crate::services;
use crate::state::AppState;

fn announce(app: &AppHandle) {
    if let Err(error) = app.emit("todos:changed", serde_json::json!(null)) {
        eprintln!("[pomodesk] could not announce To-do change: {error:?}");
    }
}

// ---- Lists -----------------------------------------------------------------

#[tauri::command]
pub async fn list_todo_lists(state: State<'_, AppState>) -> Result<Vec<TodoList>, AppError> {
    services::todos::list_lists(&state.pool).await
}

#[tauri::command]
pub async fn create_todo_list(
    app: AppHandle,
    state: State<'_, AppState>,
    input: TodoListInput,
) -> Result<TodoList, AppError> {
    let created = services::todos::create_list(&state.pool, &input).await?;
    announce(&app);
    Ok(created)
}

#[tauri::command]
pub async fn update_todo_list(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    input: TodoListInput,
) -> Result<TodoList, AppError> {
    let updated = services::todos::update_list(&state.pool, id, &input).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn set_todo_list_archived(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> Result<TodoList, AppError> {
    let updated = services::todos::set_list_archived(&state.pool, id, archived).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_todo_list(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    move_to_inbox: bool,
) -> Result<(), AppError> {
    services::todos::delete_list(&state.pool, id, move_to_inbox).await?;
    announce(&app);
    Ok(())
}

#[tauri::command]
pub async fn move_todo_list(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    direction: String,
) -> Result<(), AppError> {
    services::todos::move_list(&state.pool, id, &direction).await?;
    announce(&app);
    Ok(())
}

// ---- Tasks -----------------------------------------------------------------

#[tauri::command]
pub async fn list_todos(state: State<'_, AppState>) -> Result<Vec<Todo>, AppError> {
    services::todos::list_todos(&state.pool).await
}

#[tauri::command]
pub async fn create_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    input: TodoInput,
) -> Result<Todo, AppError> {
    let created = services::todos::create_todo(&state.pool, &input).await?;
    announce(&app);
    Ok(created)
}

#[tauri::command]
pub async fn update_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    input: TodoInput,
) -> Result<Todo, AppError> {
    let updated = services::todos::update_todo(&state.pool, id, &input).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn set_todo_done(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    done: bool,
) -> Result<Todo, AppError> {
    let updated = services::todos::set_todo_done(&state.pool, id, done).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), AppError> {
    services::todos::delete_todo(&state.pool, id).await?;
    announce(&app);
    Ok(())
}

#[tauri::command]
pub async fn move_todo(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    direction: String,
) -> Result<(), AppError> {
    services::todos::move_todo(&state.pool, id, &direction).await?;
    announce(&app);
    Ok(())
}

// ---- Checklist items -------------------------------------------------------

#[tauri::command]
pub async fn create_todo_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    todo_id: i64,
    title: String,
) -> Result<TodoSubtask, AppError> {
    let created = services::todos::create_subtask(&state.pool, todo_id, &title).await?;
    announce(&app);
    Ok(created)
}

#[tauri::command]
pub async fn update_todo_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> Result<TodoSubtask, AppError> {
    let updated = services::todos::update_subtask(&state.pool, id, &title).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn set_todo_subtask_done(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    done: bool,
) -> Result<TodoSubtask, AppError> {
    let updated = services::todos::set_subtask_done(&state.pool, id, done).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_todo_subtask(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), AppError> {
    services::todos::delete_subtask(&state.pool, id).await?;
    announce(&app);
    Ok(())
}

// ---- Reminders -------------------------------------------------------------

#[tauri::command]
pub async fn snooze_todo_reminder(
    app: AppHandle,
    state: State<'_, AppState>,
    todo_id: i64,
    minutes: i64,
) -> Result<(), AppError> {
    services::todos::snooze_reminder(&state.pool, todo_id, minutes).await?;
    announce(&app);
    Ok(())
}
