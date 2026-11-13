//! Rules for creating, editing and deleting timer presets.

use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::{Preset, PresetInput};
use crate::repositories::{app_state, presets as repo};

const MIN_DURATION_SEC: i64 = 60; // 1 minute
const MAX_DURATION_SEC: i64 = 4 * 60 * 60; // 4 hours
const MAX_NAME_CHARS: usize = 40;
const MAX_LONG_BREAK_EVERY: i64 = 12;

#[derive(Debug)]
pub struct DeletePresetOutcome {
    /// If the preset that was just deleted was the active one, this holds the
    /// id the timer should switch to (the first remaining preset).
    pub switched_to: Option<i64>,
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<Preset>, AppError> {
    let mut conn = pool.acquire().await?;
    repo::list(&mut conn).await
}

pub async fn create(pool: &SqlitePool, input: &PresetInput) -> Result<Preset, AppError> {
    let clean = validate(input)?;
    let mut conn = pool.acquire().await?;
    repo::insert(&mut conn, &clean, false).await
}

pub async fn update(pool: &SqlitePool, id: i64, input: &PresetInput) -> Result<Preset, AppError> {
    let clean = validate(input)?;
    let mut conn = pool.acquire().await?;
    repo::update(&mut conn, id, &clean).await
}

/// Deletes a preset, refusing to remove the last one so the timer always has a
/// configuration to fall back to.
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<DeletePresetOutcome, AppError> {
    let mut conn = pool.acquire().await?;

    if repo::count(&mut conn).await? <= 1 {
        return Err(AppError::conflict(
            "Keep at least one preset — PomoDesk needs a timer configuration to run.",
        ));
    }

    // Fails with a friendly "no longer exists" message if the row is gone.
    repo::get(&mut conn, id).await?;
    repo::delete(&mut conn, id).await?;

    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_PRESET_ID).await?;

    if active != Some(id) {
        return Ok(DeletePresetOutcome { switched_to: None });
    }

    let next = repo::list(&mut conn).await?.first().map(|preset| preset.id);
    if let Some(next_id) = next {
        app_state::set_i64(&mut conn, app_state::ACTIVE_PRESET_ID, next_id).await?;
    }

    Ok(DeletePresetOutcome { switched_to: next })
}

/// Trims and checks user input. Returns a cleaned copy so the rest of the app
/// never has to worry about stray spaces.
fn validate(input: &PresetInput) -> Result<PresetInput, AppError> {
    let name = input.name.trim().to_string();

    if name.is_empty() {
        return Err(AppError::validation("Give this preset a name."));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation(format!(
            "Keep the preset name to {MAX_NAME_CHARS} characters or fewer."
        )));
    }

    let durations = [
        ("Focus time", input.focus_sec),
        ("Short break", input.short_break_sec),
        ("Long break", input.long_break_sec),
    ];

    for (label, seconds) in durations {
        if seconds < MIN_DURATION_SEC {
            return Err(AppError::validation(format!(
                "{label} must be at least 1 minute."
            )));
        }
        if seconds > MAX_DURATION_SEC {
            return Err(AppError::validation(format!(
                "{label} must be 4 hours or less."
            )));
        }
    }

    if input.long_break_every < 1 || input.long_break_every > MAX_LONG_BREAK_EVERY {
        return Err(AppError::validation(format!(
            "Long breaks must happen after 1 to {MAX_LONG_BREAK_EVERY} focus sessions."
        )));
    }

    Ok(PresetInput {
        name,
        focus_sec: input.focus_sec,
        short_break_sec: input.short_break_sec,
        long_break_sec: input.long_break_sec,
        long_break_every: input.long_break_every,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> PresetInput {
        PresetInput {
            name: "  Writing  ".to_string(),
            focus_sec: 1500,
            short_break_sec: 300,
            long_break_sec: 900,
            long_break_every: 4,
        }
    }

    #[test]
    fn trims_the_name() {
        assert_eq!(validate(&valid()).unwrap().name, "Writing");
    }

    #[test]
    fn rejects_blank_names_and_short_durations() {
        let mut blank = valid();
        blank.name = "   ".to_string();
        assert!(validate(&blank).is_err());

        let mut too_short = valid();
        too_short.focus_sec = 30;
        assert!(validate(&too_short).is_err());
    }

    #[tokio::test]
    async fn refuses_to_delete_the_last_preset() {
        let pool = crate::db::memory_pool().await;

        // The fresh database has four presets; remove three.
        let mut conn = pool.acquire().await.unwrap();
        let ids: Vec<i64> = crate::repositories::presets::list(&mut conn)
            .await
            .unwrap()
            .iter()
            .map(|preset| preset.id)
            .collect();
        drop(conn);

        for id in &ids[..3] {
            delete(&pool, *id).await.unwrap();
        }

        let error = delete(&pool, ids[3]).await.unwrap_err();
        assert!(matches!(error, AppError::Conflict { .. }));
    }
}
