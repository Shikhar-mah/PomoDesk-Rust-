//! Preset commands.

use tauri::{AppHandle, Emitter, State};

use crate::error::AppError;
use crate::models::{Preset, PresetInput};
use crate::services;
use crate::state::AppState;

/// Tells the frontend that the tab list changed (for example after a delete).
fn announce(app: &AppHandle) {
    if let Err(error) = app.emit("presets:changed", serde_json::json!(null)) {
        eprintln!("[pomodesk] could not announce preset change: {error:?}");
    }
}

#[tauri::command]
pub async fn list_presets(state: State<'_, AppState>) -> Result<Vec<Preset>, AppError> {
    services::presets::list(&state.pool).await
}

#[tauri::command]
pub async fn create_preset(
    app: AppHandle,
    state: State<'_, AppState>,
    input: PresetInput,
) -> Result<Preset, AppError> {
    let created = services::presets::create(&state.pool, &input).await?;
    announce(&app);
    Ok(created)
}

#[tauri::command]
pub async fn update_preset(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    input: PresetInput,
) -> Result<Preset, AppError> {
    let updated = services::presets::update(&state.pool, id, &input).await?;
    // Durations edited while the timer is idle apply straight away.
    state.timer.apply_preset_edit(&updated).await?;
    announce(&app);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_preset(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), AppError> {
    let outcome = services::presets::delete(&state.pool, id).await?;

    // Deleting the active preset moves the timer to the first remaining one.
    if let Some(next_id) = outcome.switched_to {
        state.timer.switch_preset(next_id, true).await?;
    }

    announce(&app);
    Ok(())
}
