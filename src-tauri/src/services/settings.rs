//! Reading and writing the user's preferences (stored as one JSON blob in
//! `app_state` so adding a setting never needs a schema change).

use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::Settings;
use crate::repositories::app_state;

pub async fn get(pool: &SqlitePool) -> Result<Settings, AppError> {
    let mut conn = pool.acquire().await?;

    let Some(raw) = app_state::get(&mut conn, app_state::SETTINGS).await? else {
        return Ok(Settings::default());
    };

    match serde_json::from_str::<Settings>(&raw) {
        Ok(settings) => Ok(settings),
        Err(error) => {
            // A corrupted settings row must never block the app: fall back to
            // the defaults and keep going.
            eprintln!("[pomodesk] settings unreadable, using defaults: {error:?}");
            Ok(Settings::default())
        }
    }
}

pub async fn update(pool: &SqlitePool, settings: &Settings) -> Result<Settings, AppError> {
    let mut conn = pool.acquire().await?;
    let raw = serde_json::to_string(settings)?;
    app_state::set(&mut conn, app_state::SETTINGS, &raw).await?;
    Ok(settings.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn defaults_when_nothing_is_saved() {
        let pool = crate::db::memory_pool().await;
        let settings = get(&pool).await.unwrap();
        assert!(settings.notifications_enabled);
        assert!(!settings.auto_start_focus);
    }

    #[tokio::test]
    async fn round_trips_a_change() {
        let pool = crate::db::memory_pool().await;

        let mut settings = get(&pool).await.unwrap();
        settings.auto_start_focus = true;
        settings.sound_enabled = false;
        update(&pool, &settings).await.unwrap();

        let reloaded = get(&pool).await.unwrap();
        assert!(reloaded.auto_start_focus);
        assert!(!reloaded.sound_enabled);
    }
}
