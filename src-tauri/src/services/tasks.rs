//! Rules for tasks: exactly one active task, completed tasks cannot be active,
//! and marking the active task done clears the selection.

use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::{now_utc, to_sql_timestamp, Task, TaskInput};
use crate::repositories::{app_state, tasks as repo};

const MAX_TITLE_CHARS: usize = 120;
const MAX_NOTE_CHARS: usize = 2000;

pub async fn list(pool: &SqlitePool) -> Result<Vec<Task>, AppError> {
    let mut conn = pool.acquire().await?;
    let rows = repo::list(&mut conn).await?;
    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    Ok(rows
        .into_iter()
        .map(|row| Task::from_row(row, active))
        .collect())
}

pub async fn create(pool: &SqlitePool, input: &TaskInput) -> Result<Task, AppError> {
    let clean = validate(input)?;
    let mut conn = pool.acquire().await?;
    let row = repo::insert(&mut conn, &clean).await?;
    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    Ok(Task::from_row(row, active))
}

pub async fn update(pool: &SqlitePool, id: i64, input: &TaskInput) -> Result<Task, AppError> {
    let clean = validate(input)?;
    let mut conn = pool.acquire().await?;
    let row = repo::update(&mut conn, id, &clean).await?;
    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    Ok(Task::from_row(row, active))
}

/// Marks a task done (or re-opens it). Finishing the active task also clears
/// the selection, exactly as the product description requires.
pub async fn set_done(pool: &SqlitePool, id: i64, done: bool) -> Result<Task, AppError> {
    let mut conn = pool.acquire().await?;

    let completed_at = if done {
        Some(to_sql_timestamp(now_utc()))
    } else {
        None
    };

    let row = repo::set_done(&mut conn, id, done, completed_at).await?;

    let mut active = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    if done && active == Some(id) {
        app_state::remove(&mut conn, app_state::ACTIVE_TASK_ID).await?;
        active = None;
    }

    Ok(Task::from_row(row, active))
}

pub async fn delete(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete(&mut conn, id).await?;

    if app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await? == Some(id) {
        app_state::remove(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    }
    Ok(())
}

/// `None` clears the active task. A completed task cannot be selected.
pub async fn set_active(pool: &SqlitePool, id: Option<i64>) -> Result<Option<i64>, AppError> {
    let mut conn = pool.acquire().await?;

    match id {
        Some(task_id) => {
            let task = repo::get(&mut conn, task_id).await?;
            if task.is_done {
                return Err(AppError::conflict(
                    "A completed task can't be the task you're focusing on. Re-open it first.",
                ));
            }
            app_state::set_i64(&mut conn, app_state::ACTIVE_TASK_ID, task_id).await?;
            Ok(Some(task_id))
        }
        None => {
            app_state::remove(&mut conn, app_state::ACTIVE_TASK_ID).await?;
            Ok(None)
        }
    }
}

fn validate(input: &TaskInput) -> Result<TaskInput, AppError> {
    let title = input.title.trim().to_string();
    let note = input.note.trim().to_string();

    if title.is_empty() {
        return Err(AppError::validation("Give the task a title."));
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::validation(format!(
            "Keep the task title to {MAX_TITLE_CHARS} characters or fewer."
        )));
    }
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err(AppError::validation(
            "That note is too long. Please shorten it a little.",
        ));
    }
    if input.est_slots < 1 || input.est_slots > 99 {
        return Err(AppError::validation(
            "Estimated pomodoros must be between 1 and 99.",
        ));
    }

    Ok(TaskInput {
        title,
        note,
        est_slots: input.est_slots,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn finishing_the_active_task_clears_the_selection() {
        let pool = crate::db::memory_pool().await;

        let task = create(
            &pool,
            &TaskInput {
                title: "Write the report".into(),
                note: String::new(),
                est_slots: 2,
            },
        )
        .await
        .unwrap();

        set_active(&pool, Some(task.id)).await.unwrap();
        let finished = set_done(&pool, task.id, true).await.unwrap();

        assert!(finished.is_done);
        assert!(!finished.is_active);
        assert!(finished.completed_at.is_some());

        // A completed task may not be re-activated.
        let error = set_active(&pool, Some(task.id)).await.unwrap_err();
        assert!(matches!(error, AppError::Conflict { .. }));
    }

    #[tokio::test]
    async fn only_one_task_is_active_at_a_time() {
        let pool = crate::db::memory_pool().await;

        let first = create(
            &pool,
            &TaskInput {
                title: "First".into(),
                note: String::new(),
                est_slots: 1,
            },
        )
        .await
        .unwrap();
        let second = create(
            &pool,
            &TaskInput {
                title: "Second".into(),
                note: String::new(),
                est_slots: 1,
            },
        )
        .await
        .unwrap();

        set_active(&pool, Some(first.id)).await.unwrap();
        set_active(&pool, Some(second.id)).await.unwrap();

        let tasks = list(&pool).await.unwrap();
        let active: Vec<i64> = tasks
            .iter()
            .filter(|task| task.is_active)
            .map(|task| task.id)
            .collect();

        assert_eq!(active, vec![second.id]);
    }
}
