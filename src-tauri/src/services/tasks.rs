//! Rules for tasks: exactly one active task, completed tasks cannot be active,
//! and marking the active task done clears the selection.

use sqlx::SqlitePool;

use std::collections::HashMap;

use crate::error::AppError;
use crate::models::{now_utc, to_sql_timestamp, Subtask, Task, TaskInput};
use crate::repositories::{app_state, subtasks as subtask_repo, tags as tag_repo, tasks as repo};

const MAX_TITLE_CHARS: usize = 120;
const MAX_NOTE_CHARS: usize = 2000;

pub async fn list(pool: &SqlitePool) -> Result<Vec<Task>, AppError> {
    let mut conn = pool.acquire().await?;
    let rows = repo::list(&mut conn).await?;
    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    let active_subtask = app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;

    let tag_rows = tag_repo::list_for_tasks(&mut conn).await?;
    let subtask_rows = subtask_repo::list_all(&mut conn).await?;

    let mut tags_by_task: HashMap<i64, Vec<String>> = HashMap::new();
    for (task_id, name) in tag_rows {
        tags_by_task.entry(task_id).or_default().push(name);
    }
    let mut subtasks_by_task: HashMap<i64, Vec<Subtask>> = HashMap::new();
    for row in subtask_rows {
        let tid = row.task_id;
        subtasks_by_task
            .entry(tid)
            .or_default()
            .push(Subtask::from_row(row, active_subtask));
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let id = row.id;
            let mut task = Task::from_row(row, active);
            task.tags = tags_by_task.remove(&id).unwrap_or_default();
            task.subtasks = subtasks_by_task.remove(&id).unwrap_or_default();
            task
        })
        .collect())
}

pub async fn create(pool: &SqlitePool, input: &TaskInput) -> Result<Task, AppError> {
    let mut clean = validate(input)?;
    // A new task always starts at zero completed pomodoros.
    clean.completed_slots = None;
    let tags = clean.tags.clone();

    let mut conn = pool.acquire().await?;
    let row = repo::insert(&mut conn, &clean).await?;
    let id = row.id;
    if !tags.is_empty() {
        tag_repo::replace_for_task(&mut conn, id, &tags).await?;
        tag_repo::delete_orphans(&mut conn).await?;
    }
    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    let active_subtask = app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;

    let tag_rows = tag_repo::list_for_tasks(&mut conn).await?;
    let subtask_rows = subtask_repo::list_all(&mut conn).await?;
    let mut tags_by_task: HashMap<i64, Vec<String>> = HashMap::new();
    for (task_id, name) in tag_rows {
        if task_id == id {
            tags_by_task.entry(task_id).or_default().push(name);
        }
    }
    let mut task = Task::from_row(row, active);
    task.tags = tags_by_task.remove(&id).unwrap_or(tags);
    task.subtasks = subtask_rows
        .into_iter()
        .filter(|r| r.task_id == id)
        .map(|r| Subtask::from_row(r, active_subtask))
        .collect();
    Ok(task)
}

pub async fn update(pool: &SqlitePool, id: i64, input: &TaskInput) -> Result<Task, AppError> {
    let clean = validate(input)?;
    let tags = clean.tags.clone();

    let mut conn = pool.acquire().await?;
    let row = repo::update(&mut conn, id, &clean).await?;
    let id = row.id;
    tag_repo::replace_for_task(&mut conn, id, &tags).await?;
    tag_repo::delete_orphans(&mut conn).await?;

    let active = app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await?;
    let active_subtask = app_state::get_i64(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;

    let tag_rows = tag_repo::list_for_tasks(&mut conn).await?;
    let subtask_rows = subtask_repo::list_all(&mut conn).await?;
    let mut task_tags: Vec<String> = Vec::new();
    for (task_id, name) in tag_rows {
        if task_id == id {
            task_tags.push(name);
        }
    }
    let mut task = Task::from_row(row, active);
    task.tags = task_tags;
    task.subtasks = subtask_rows
        .into_iter()
        .filter(|r| r.task_id == id)
        .map(|r| Subtask::from_row(r, active_subtask))
        .collect();
    Ok(task)
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
        app_state::remove(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
        active = None;
    }

    Ok(Task::from_row(row, active))
}

pub async fn delete(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete(&mut conn, id).await?;

    if app_state::get_i64(&mut conn, app_state::ACTIVE_TASK_ID).await? == Some(id) {
        app_state::remove(&mut conn, app_state::ACTIVE_TASK_ID).await?;
        app_state::remove(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
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
            app_state::remove(&mut conn, app_state::ACTIVE_SUBTASK_ID).await?;
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
    if let Some(count) = input.completed_slots {
        if !(0..=999).contains(&count) {
            return Err(AppError::validation(
                "Pomodoros done must be between 0 and 999.",
            ));
        }
    }

    // Tags: trim, drop empties, de-duplicate case-insensitively, max 5, 24 chars.
    let mut tags: Vec<String> = Vec::new();
    for raw in &input.tags {
        let t = raw.trim().to_string();
        if t.is_empty() {
            continue;
        }
        if t.chars().count() > 24 {
            return Err(AppError::validation(
                "Keep each tag to 24 characters or fewer.",
            ));
        }
        if !tags.iter().any(|existing| existing.eq_ignore_ascii_case(&t)) {
            tags.push(t);
        }
    }
    if tags.len() > 5 {
        return Err(AppError::validation(
            "Keep tags to 5 or fewer per task.",
        ));
    }

    Ok(TaskInput {
        title,
        note,
        est_slots: input.est_slots,
        completed_slots: input.completed_slots,
        tags,
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
                completed_slots: None,
                tags: Vec::new(),
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
    async fn editing_a_task_updates_both_pomodoro_counts_and_tags() {
        let pool = crate::db::memory_pool().await;

        let task = create(
            &pool,
            &TaskInput {
                title: "Write the report".into(),
                note: String::new(),
                est_slots: 2,
                completed_slots: None,
                tags: Vec::new(),
            },
        )
        .await
        .unwrap();

        let updated = update(
            &pool,
            task.id,
            &TaskInput {
                title: "Write the report".into(),
                note: String::new(),
                est_slots: 5,
                completed_slots: Some(3),
                tags: vec!["work".into(), "focus".into()],
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.est_slots, 5);
        assert_eq!(updated.completed_slots, 3);
        assert_eq!(updated.tags, vec!["focus".to_string(), "work".to_string()]);

        let reloaded = list(&pool).await.unwrap();
        let reloaded = reloaded.iter().find(|t| t.id == task.id).unwrap();
        assert_eq!(reloaded.est_slots, 5);
        assert_eq!(reloaded.completed_slots, 3);
        assert_eq!(reloaded.tags, vec!["focus".to_string(), "work".to_string()]);
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
                completed_slots: None,
                tags: Vec::new(),
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
                completed_slots: None,
                tags: Vec::new(),
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
