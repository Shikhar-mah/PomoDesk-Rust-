//! Settings commands.

use std::sync::atomic::Ordering;

use tauri::State;

use crate::error::AppError;
use crate::models::Settings;
use crate::services;
use crate::state::AppState;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    services::settings::get(&state.pool).await
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Settings, AppError> {
    let saved = services::settings::update(&state.pool, &settings).await?;

    // Keep the window-close handler in sync without a database read.
    state
        .minimize_to_tray
        .store(saved.minimize_to_tray, Ordering::Relaxed);

    Ok(saved)
}
