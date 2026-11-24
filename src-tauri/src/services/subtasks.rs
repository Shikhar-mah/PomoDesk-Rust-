//! Rules for subtasks: one focused subtask at a time, and a focused subtask
//! implies its parent task is focused too.

use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::{now_utc, to_sql_timestamp, Subtask, SubtaskInput};
use crate::repositories::{app_state, subtasks as repo, tasks as task_repo};

const MAX_TITLE_CHARS: usize = 120;

pub async fn create(
    pool: &SqlitePool,
    task_id: i64,
    input: &SubtaskInput,
) -> Result<Subtask, AppError> {
    let clean = validate(input)?;
    let mut conn = pool.acquire().await?;

    // Parent must exist.
    task_repo::get(&mut conn, task_id).await?;

    let row = repo::insert(&mut conn, task_id, &clean).await?;
    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
    Ok(Subtask::from_row(row, active))
}

pub async fn update(
    pool: &SqlitePool,
    id: i64,
    input: &SubtaskInput,
) -> Result<Subtask, AppError> {
    let clean = validate(input)?;
    let mut conn = pool.acquire().await?;
    let row = repo::update(&mut conn, id, &clean).await?;
    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
    Ok(Subtask::from_row(row, active))
}

pub async fn set_done(pool: &SqlitePool, id: i64, done: bool) -> Result<Subtask, AppError> {
    let mut conn = pool.acquire().await?;
    let completed_at = if done {
        Some(to_sql_timestamp(now_utc()))
    } else {
        None
    };
    let row = repo::set_done(&mut conn, id, done, completed_at).await?;

    // Finishing the focused subtask clears the focus.
    if done && app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await? == Some(id) {
        app_state::remove(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
    }

    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
    Ok(Subtask::from_row(row, active))
}

pub async fn delete(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete(&mut conn, id).await?;

    if app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await? == Some(id) {
        app_state::remove(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
    }
    Ok(())
}

/// `None` clears the focused subtask. A done subtask cannot be focused, and
/// focusing a subtask also focuses its parent task.
pub async fn set_active(pool: &SqlitePool, id: Option<i64>) -> Result<Option<i64>, AppError> {
    let mut conn = pool.acquire().await?;

    match id {
        Some(subtask_id) => {
            let subtask = repo::get(&mut conn, subtask_id).await?;
            if subtask.is_done {
                return Err(AppError::conflict(
                    "A completed subtask can't be the one you're focusing on.",
                ));
            }
            app_state::set_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID, subtask_id).await?;
            // Focusing a subtask implies its parent task.
            app_state::set_i64(&mut conn, crate::repositories::app_state::ACTIVE_TASK_ID, subtask.task_id).await?;
            Ok(Some(subtask_id))
        }
        None => {
            app_state::remove(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
            Ok(None)
        }
    }
}

fn validate(input: &SubtaskInput) -> Result<SubtaskInput, AppError> {
    let title = input.title.trim().to_string();

    if title.is_empty() {
        return Err(AppError::validation("Give the subtask a title."));
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::validation(format!(
            "Keep the subtask title to {MAX_TITLE_CHARS} characters or fewer."
        )));
    }
    let est_slots = if input.est_slots < 1 {
        1
    } else if input.est_slots > 99 {
        return Err(AppError::validation(
            "Estimated pomodoros must be between 1 and 99.",
        ));
    } else {
        input.est_slots
    };
    if let Some(count) = input.completed_slots {
        if !(0..=999).contains(&count) {
            return Err(AppError::validation(
                "Pomodoros done must be between 0 and 999.",
            ));
        }
    }

    Ok(SubtaskInput {
        title,
        est_slots,
        completed_slots: input.completed_slots,
    })
}