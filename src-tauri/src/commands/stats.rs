//! Statistics commands.

use tauri::State;

use crate::error::AppError;
use crate::models::{DailyStat, StatsToday, StatsTotals};
use crate::services;
use crate::state::AppState;

#[tauri::command]
pub async fn get_stats_today(state: State<'_, AppState>) -> Result<StatsToday, AppError> {
    services::stats::today(&state.pool).await
}

#[tauri::command]
pub async fn get_stats_daily(
    state: State<'_, AppState>,
    days: i64,
) -> Result<Vec<DailyStat>, AppError> {
    services::stats::daily(&state.pool, days).await
}

#[tauri::command]
pub async fn get_stats_totals(state: State<'_, AppState>) -> Result<StatsTotals, AppError> {
    services::stats::totals(&state.pool).await
}

#[tauri::command]
pub async fn get_streak(state: State<'_, AppState>) -> Result<i64, AppError> {
    services::stats::streak(&state.pool).await
}
