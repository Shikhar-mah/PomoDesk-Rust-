//! Rules for the independent To-do module.
//!
//! To-do data shares no tables, models or completion pipeline with Pomodoro
//! tasks. Completing a To-do never touches `tasks`, `sessions`, `app_state` or
//! the statistics.

use std::collections::HashMap;

use chrono::{Local, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone};
use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::{
    now_utc, to_sql_timestamp, DueReminder, Priority, ReminderInput, Todo, TodoInput, TodoList,
    TodoListInput, TodoReminder, TodoSubtask, TodoSubtaskRow,
};
use crate::repositories::{
    todo_lists as list_repo, todo_reminders as reminder_repo, todo_subtasks as subtask_repo,
    todos as repo,
};

const MAX_TITLE_CHARS: usize = 200;
const MAX_NOTE_CHARS: usize = 4000;
const MAX_LIST_NAME_CHARS: usize = 60;
const MAX_SUBTASK_CHARS: usize = 200;

const LIST_COLORS: [&str; 6] = ["zinc", "blue", "green", "amber", "rose", "violet"];
const LIST_ICONS: [&str; 6] = ["list", "inbox", "briefcase", "user", "book", "heart"];

type Direction = str;

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

pub async fn list_lists(pool: &SqlitePool) -> Result<Vec<TodoList>, AppError> {
    let mut conn = pool.acquire().await?;
    list_repo::list(&mut conn).await
}

pub async fn create_list(
    pool: &SqlitePool,
    input: &TodoListInput,
) -> Result<TodoList, AppError> {
    let clean = validate_list(input)?;
    let mut conn = pool.acquire().await?;
    list_repo::insert(&mut conn, &clean).await
}

pub async fn update_list(
    pool: &SqlitePool,
    id: i64,
    input: &TodoListInput,
) -> Result<TodoList, AppError> {
    let clean = validate_list(input)?;
    let mut conn = pool.acquire().await?;
    list_repo::update(&mut conn, id, &clean).await
}

pub async fn set_list_archived(
    pool: &SqlitePool,
    id: i64,
    archived: bool,
) -> Result<TodoList, AppError> {
    let mut conn = pool.acquire().await?;
    let list = list_repo::get(&mut conn, id).await?;
    if list.is_inbox {
        return Err(AppError::conflict(
            "Inbox can't be archived. Move its tasks to another list first.",
        ));
    }

    let archived_at = if archived {
        Some(to_sql_timestamp(now_utc()))
    } else {
        None
    };
    list_repo::set_archived(&mut conn, id, archived_at).await
}

pub async fn delete_list(
    pool: &SqlitePool,
    id: i64,
    move_to_inbox: bool,
) -> Result<(), AppError> {
    let mut tx = pool.begin().await?;
    let list = list_repo::get(&mut tx, id).await?;
    if list.is_inbox {
        return Err(AppError::conflict(
            "Inbox can't be deleted. It is where tasks go when a list is removed.",
        ));
    }

    if move_to_inbox {
        list_repo::ensure_inbox(&mut tx).await?;
        let inbox = list_repo::inbox(&mut tx).await?;
        let inbox_id = inbox
            .map(|row| row.id)
            .ok_or_else(|| AppError::internal("PomoDesk couldn't find your Inbox."))?;
        repo::move_list(&mut tx, id, inbox_id).await?;
    }

    list_repo::delete(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn move_list(pool: &SqlitePool, id: i64, direction: &Direction) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    list_repo::get(&mut conn, id).await?;

    let lists = list_repo::list(&mut conn).await?;
    let mut ids: Vec<i64> = lists.iter().map(|row| row.id).collect();
    swap_neighbour(&mut ids, id, direction)?;

    for (index, list_id) in ids.iter().enumerate() {
        list_repo::set_sort_order(&mut conn, *list_id, index as i64).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

pub async fn list_todos(pool: &SqlitePool) -> Result<Vec<Todo>, AppError> {
    let mut conn = pool.acquire().await?;
    let rows = repo::list_all(&mut conn).await?;
    let subtask_rows = subtask_repo::list_all(&mut conn).await?;
    let reminder_rows = reminder_repo::list_all(&mut conn).await?;

    let mut subtasks_by_todo: HashMap<i64, Vec<TodoSubtask>> = HashMap::new();
    for row in subtask_rows {
        let todo_id = row.todo_id;
        subtasks_by_todo
            .entry(todo_id)
            .or_default()
            .push(subtask_from_row(row));
    }

    let mut reminders_by_todo: HashMap<i64, TodoReminder> = HashMap::new();
    for row in reminder_rows {
        let todo_id = row.todo_id;
        reminders_by_todo.insert(todo_id, row.into());
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let id = row.id;
            todo_from_row(
                row,
                subtasks_by_todo.remove(&id).unwrap_or_default(),
                reminders_by_todo.remove(&id),
            )
        })
        .collect())
}

pub async fn create_todo(pool: &SqlitePool, input: &TodoInput) -> Result<Todo, AppError> {
    let clean = validate_todo(input)?;
    let priority = clean.priority.unwrap_or_default();

    let mut tx = pool.begin().await?;
    ensure_list(&mut tx, clean.list_id).await?;

    let row = repo::insert(
        &mut tx,
        &repo::NewTodo {
            list_id: clean.list_id,
            title: &clean.title,
            note: &clean.note,
            priority: priority.as_str(),
            due_date: clean.due_date.as_deref(),
            due_time: clean.due_time.as_deref(),
        },
    )
    .await?;

    if let Some(spec) = reminder_spec(
        clean.due_date.as_deref(),
        clean.due_time.as_deref(),
        clean.reminder.as_ref(),
    )? {
        reminder_repo::upsert(
            &mut tx,
            row.id,
            &spec.fire_at,
            spec.kind,
            spec.lead_minutes,
        )
        .await?;
    }

    let reminder = reminder_repo::get_for_todo(&mut tx, row.id).await?;
    tx.commit().await?;

    Ok(todo_from_row(row, Vec::new(), reminder.map(|r| r.into())))
}

pub async fn update_todo(
    pool: &SqlitePool,
    id: i64,
    input: &TodoInput,
) -> Result<Todo, AppError> {
    let clean = validate_todo(input)?;
    let priority = clean.priority.unwrap_or_default();

    let mut tx = pool.begin().await?;
    let existing = repo::get(&mut tx, id).await?;
    ensure_list(&mut tx, clean.list_id).await?;

    let row = repo::update(
        &mut tx,
        id,
        &repo::TodoUpdate {
            list_id: clean.list_id,
            title: &clean.title,
            note: &clean.note,
            priority: priority.as_str(),
            due_date: clean.due_date.as_deref(),
            due_time: clean.due_time.as_deref(),
        },
    )
    .await?;

    // A completed task keeps no pending reminder.
    if existing.is_done {
        reminder_repo::delete_for_todo(&mut tx, id).await?;
    } else if let Some(spec) = reminder_spec(
        clean.due_date.as_deref(),
        clean.due_time.as_deref(),
        clean.reminder.as_ref(),
    )? {
        reminder_repo::upsert(
            &mut tx,
            id,
            &spec.fire_at,
            spec.kind,
            spec.lead_minutes,
        )
        .await?;
    } else {
        reminder_repo::delete_for_todo(&mut tx, id).await?;
    }

    let reminder = reminder_repo::get_for_todo(&mut tx, id).await?;
    let subtasks = subtask_repo::list_all(&mut tx).await?;
    tx.commit().await?;

    let subtasks = subtasks
        .into_iter()
        .filter(|row| row.todo_id == id)
        .map(subtask_from_row)
        .collect();

    Ok(todo_from_row(row, subtasks, reminder.map(|r| r.into())))
}

pub async fn set_todo_done(
    pool: &SqlitePool,
    id: i64,
    done: bool,
) -> Result<Todo, AppError> {
    let mut tx = pool.begin().await?;
    let completed_at = if done {
        Some(to_sql_timestamp(now_utc()))
    } else {
        None
    };

    let row = repo::set_done(&mut tx, id, done, completed_at).await?;
    if done {
        reminder_repo::delete_for_todo(&mut tx, id).await?;
    }

    let subtasks = subtask_repo::list_all(&mut tx).await?;
    let reminder = reminder_repo::get_for_todo(&mut tx, id).await?;
    tx.commit().await?;

    let subtasks = subtasks
        .into_iter()
        .filter(|entry| entry.todo_id == id)
        .map(subtask_from_row)
        .collect();

    Ok(todo_from_row(row, subtasks, reminder.map(|r| r.into())))
}

pub async fn delete_todo(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    repo::delete(&mut conn, id).await
}

pub async fn move_todo(
    pool: &SqlitePool,
    id: i64,
    direction: &Direction,
) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    let row = repo::get(&mut conn, id).await?;
    let mut ids = repo::ids_in_list(&mut conn, row.list_id).await?;
    swap_neighbour(&mut ids, id, direction)?;

    for (index, task_id) in ids.iter().enumerate() {
        repo::set_sort_order(&mut conn, *task_id, index as i64).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------

pub async fn create_subtask(
    pool: &SqlitePool,
    todo_id: i64,
    title: &str,
) -> Result<TodoSubtask, AppError> {
    let title = validate_subtask_title(title)?;
    let mut tx = pool.begin().await?;
    repo::get(&mut tx, todo_id).await?;
    let row = subtask_repo::insert(&mut tx, todo_id, &title).await?;
    tx.commit().await?;
    Ok(subtask_from_row(row))
}

pub async fn update_subtask(
    pool: &SqlitePool,
    id: i64,
    title: &str,
) -> Result<TodoSubtask, AppError> {
    let title = validate_subtask_title(title)?;
    let mut conn = pool.acquire().await?;
    let row = subtask_repo::update_title(&mut conn, id, &title).await?;
    Ok(subtask_from_row(row))
}

pub async fn set_subtask_done(
    pool: &SqlitePool,
    id: i64,
    done: bool,
) -> Result<TodoSubtask, AppError> {
    let completed_at = if done {
        Some(to_sql_timestamp(now_utc()))
    } else {
        None
    };
    let mut conn = pool.acquire().await?;
    let row = subtask_repo::set_done(&mut conn, id, done, completed_at).await?;
    Ok(subtask_from_row(row))
}

pub async fn delete_subtask(pool: &SqlitePool, id: i64) -> Result<(), AppError> {
    let mut conn = pool.acquire().await?;
    subtask_repo::delete(&mut conn, id).await
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

pub struct ReminderSpec {
    pub fire_at: String,
    pub kind: &'static str,
    pub lead_minutes: Option<i64>,
}

/// Computes the reminder row for an input, or `None` when no reminder is set.
pub fn reminder_spec(
    due_date: Option<&str>,
    due_time: Option<&str>,
    reminder: Option<&ReminderInput>,
) -> Result<Option<ReminderSpec>, AppError> {
    let Some(reminder) = reminder else {
        return Ok(None);
    };

    match reminder {
        ReminderInput::Due => {
            let fire_at = due_instant(due_date, due_time, 0)?;
            Ok(Some(ReminderSpec {
                fire_at,
                kind: "due",
                lead_minutes: None,
            }))
        }
        ReminderInput::Before { lead_minutes } => {
            if !(1..=10_080).contains(lead_minutes) {
                return Err(AppError::validation(
                    "Choose a reminder between 1 minute and 7 days before the due time.",
                ));
            }
            let fire_at = due_instant(due_date, due_time, -*lead_minutes)?;
            Ok(Some(ReminderSpec {
                fire_at,
                kind: "before",
                lead_minutes: Some(*lead_minutes),
            }))
        }
        ReminderInput::Custom { at } => {
            let naive = NaiveDateTime::parse_from_str(at.trim(), "%Y-%m-%dT%H:%M")
                .or_else(|_| NaiveDateTime::parse_from_str(at.trim(), "%Y-%m-%dT%H:%M:%S"))
                .map_err(|_| AppError::validation("Choose a valid reminder date and time."))?;
            Ok(Some(ReminderSpec {
                fire_at: local_to_utc(naive),
                kind: "custom",
                lead_minutes: None,
            }))
        }
    }
}

/// The UTC instant for a local due date/time, anchored at 09:00 when no time is
/// set. `offset_minutes` shifts backwards for "N minutes before".
pub fn due_instant(
    due_date: Option<&str>,
    due_time: Option<&str>,
    offset_minutes: i64,
) -> Result<String, AppError> {
    let date = due_date.ok_or_else(|| {
        AppError::validation("Add a due date before setting a reminder for it.")
    })?;
    let date = parse_date(date)?;
    let time = match due_time {
        Some(value) => parse_time(value)?,
        None => NaiveTime::from_hms_opt(9, 0, 0).expect("09:00 is a valid time"),
    };
    let naive = date.and_time(time) - chrono::Duration::minutes(offset_minutes);
    Ok(local_to_utc(naive))
}

/// Resolves a local wall-clock value to UTC.
///
/// A time that does not exist (the spring-forward gap) is pushed one hour
/// forward. An ambiguous time (the autumn overlap) picks the earliest
/// occurrence.
pub fn local_to_utc(naive: NaiveDateTime) -> String {
    let mut candidate = naive;
    for _ in 0..4 {
        match Local.from_local_datetime(&candidate) {
            LocalResult::Single(dt) => return to_sql_timestamp(dt.with_timezone(&chrono::Utc)),
            LocalResult::Ambiguous(earliest, _) => {
                return to_sql_timestamp(earliest.with_timezone(&chrono::Utc))
            }
            LocalResult::None => {
                candidate += chrono::Duration::hours(1);
            }
        }
    }
    // Last resort: treat the value as UTC. This only happens for pathological
    // timezone data; it still gives a usable reminder instead of failing.
    to_sql_timestamp(chrono::Utc.from_utc_datetime(&naive))
}

pub async fn snooze_reminder(
    pool: &SqlitePool,
    todo_id: i64,
    minutes: i64,
) -> Result<(), AppError> {
    if !(1..=10_080).contains(&minutes) {
        return Err(AppError::validation("Choose a snooze time between 1 minute and 7 days."));
    }
    let mut conn = pool.acquire().await?;
    let row = reminder_repo::get_for_todo(&mut conn, todo_id).await?;
    if row.is_none() {
        return Err(AppError::not_found("That task has no reminder to snooze."));
    }
    let fire_at = to_sql_timestamp(now_utc() + chrono::Duration::minutes(minutes));
    reminder_repo::snooze(&mut conn, todo_id, &fire_at).await
}

/// A pending reminder for the scheduler, with stale rows filtered out.
pub fn should_notify(reminder: &DueReminder) -> bool {
    !reminder.is_done && reminder.archived_at.is_none()
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

struct CleanTodo {
    title: String,
    note: String,
    list_id: i64,
    priority: Option<Priority>,
    due_date: Option<String>,
    due_time: Option<String>,
    reminder: Option<ReminderInput>,
}

fn validate_todo(input: &TodoInput) -> Result<CleanTodo, AppError> {
    let title = input.title.trim().to_string();
    let note = input.note.trim().to_string();

    if title.is_empty() {
        return Err(AppError::validation("Give the task a title."));
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::validation(format!(
            "Keep the To-do title to {MAX_TITLE_CHARS} characters or fewer."
        )));
    }
    if note.chars().count() > MAX_NOTE_CHARS {
        return Err(AppError::validation(
            "That note is too long. Please shorten it a little.",
        ));
    }

    let due_date = input
        .due_date
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let due_time = input
        .due_time
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if let Some(date) = &due_date {
        parse_date(date)?;
    }
    if let Some(time) = &due_time {
        parse_time(time)?;
        if due_date.is_none() {
            return Err(AppError::validation(
                "Choose a due date before adding a due time.",
            ));
        }
    }

    Ok(CleanTodo {
        title,
        note,
        list_id: input.list_id,
        priority: input.priority,
        due_date,
        due_time,
        reminder: input.reminder.clone(),
    })
}

fn validate_list(input: &TodoListInput) -> Result<TodoListInput, AppError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::validation("Give the list a name."));
    }
    if name.chars().count() > MAX_LIST_NAME_CHARS {
        return Err(AppError::validation(format!(
            "Keep the list name to {MAX_LIST_NAME_CHARS} characters or fewer."
        )));
    }
    if !LIST_COLORS.contains(&input.color.as_str()) {
        return Err(AppError::validation("Choose one of the list colours."));
    }
    if !LIST_ICONS.contains(&input.icon.as_str()) {
        return Err(AppError::validation("Choose one of the list icons."));
    }
    Ok(TodoListInput {
        name,
        color: input.color.clone(),
        icon: input.icon.clone(),
    })
}

fn validate_subtask_title(title: &str) -> Result<String, AppError> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::validation("Give the checklist item a title."));
    }
    if title.chars().count() > MAX_SUBTASK_CHARS {
        return Err(AppError::validation(format!(
            "Keep checklist items to {MAX_SUBTASK_CHARS} characters or fewer."
        )));
    }
    Ok(title)
}

async fn ensure_list(
    conn: &mut sqlx::SqliteConnection,
    list_id: i64,
) -> Result<TodoList, AppError> {
    list_repo::get(conn, list_id).await
}

fn swap_neighbour(ids: &mut [i64], id: i64, direction: &str) -> Result<(), AppError> {
    let Some(index) = ids.iter().position(|entry| *entry == id) else {
        return Err(AppError::not_found("That item no longer exists."));
    };

    let target = match direction {
        "up" if index > 0 => index - 1,
        "down" if index + 1 < ids.len() => index + 1,
        "up" | "down" => return Ok(()),
        _ => return Err(AppError::validation("Unknown move direction.")),
    };

    ids.swap(index, target);
    Ok(())
}

fn parse_date(value: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::validation("Choose a valid due date."))
}

fn parse_time(value: &str) -> Result<NaiveTime, AppError> {
    NaiveTime::parse_from_str(value, "%H:%M")
        .or_else(|_| NaiveTime::parse_from_str(value, "%H:%M:%S"))
        .map_err(|_| AppError::validation("Choose a valid due time."))
}

fn todo_from_row(
    row: crate::models::TodoRow,
    subtasks: Vec<TodoSubtask>,
    reminder: Option<TodoReminder>,
) -> Todo {
    Todo {
        id: row.id,
        list_id: row.list_id,
        title: row.title,
        note: row.note,
        is_done: row.is_done,
        priority: Priority::parse(&row.priority).unwrap_or_default(),
        due_date: row.due_date,
        due_time: row.due_time,
        sort_order: row.sort_order,
        created_at: row.created_at,
        completed_at: row.completed_at,
        subtasks,
        reminder,
    }
}

fn subtask_from_row(row: TodoSubtaskRow) -> TodoSubtask {
    row.into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str, list_id: i64) -> TodoInput {
        TodoInput {
            title: title.into(),
            note: String::new(),
            list_id,
            priority: None,
            due_date: None,
            due_time: None,
            reminder: None,
        }
    }

    async fn inbox(pool: &SqlitePool) -> i64 {
        list_repo::inbox(&mut pool.acquire().await.unwrap())
            .await
            .unwrap()
            .unwrap()
            .id
    }

    #[tokio::test]
    async fn inbox_is_seeded_and_protected() {
        let pool = crate::db::memory_pool().await;
        let lists = list_lists(&pool).await.unwrap();
        let inbox = lists.iter().find(|list| list.is_inbox).unwrap();
        assert_eq!(inbox.name, "Inbox");

        let archive = set_list_archived(&pool, inbox.id, true).await;
        assert!(matches!(archive, Err(AppError::Conflict { .. })));

        let delete = delete_list(&pool, inbox.id, true).await;
        assert!(matches!(delete, Err(AppError::Conflict { .. })));
    }

    #[tokio::test]
    async fn quick_add_needs_only_a_title() {
        let pool = crate::db::memory_pool().await;
        let inbox = inbox(&pool).await;

        let created = create_todo(&pool, &input("Call the dentist", inbox))
            .await
            .unwrap();

        assert_eq!(created.title, "Call the dentist");
        assert_eq!(created.priority, Priority::Medium);
        assert!(created.due_date.is_none());
        assert!(created.reminder.is_none());
        assert!(!created.is_done);
    }

    #[tokio::test]
    async fn empty_titles_and_invalid_fields_are_rejected() {
        let pool = crate::db::memory_pool().await;
        let inbox = inbox(&pool).await;

        let empty = create_todo(&pool, &input("   ", inbox)).await;
        assert!(matches!(empty, Err(AppError::Validation { .. })));

        let mut no_date = input("Task", inbox);
        no_date.due_time = Some("10:00".into());
        assert!(matches!(
            create_todo(&pool, &no_date).await,
            Err(AppError::Validation { .. })
        ));

        let mut bad_priority_free = input("Task", inbox);
        bad_priority_free.due_date = Some("2026-13-40".into());
        assert!(matches!(
            create_todo(&pool, &bad_priority_free).await,
            Err(AppError::Validation { .. })
        ));

        let missing_list = create_todo(&pool, &input("Task", 9999)).await;
        assert!(matches!(missing_list, Err(AppError::NotFound { .. })));
    }

    #[tokio::test]
    async fn deleting_a_list_moves_tasks_to_inbox_or_deletes_them() {
        let pool = crate::db::memory_pool().await;
        let inbox = inbox(&pool).await;

        let work = create_list(
            &pool,
            &TodoListInput {
                name: "Work".into(),
                color: "blue".into(),
                icon: "briefcase".into(),
            },
        )
        .await
        .unwrap();
        let task = create_todo(&pool, &input("Move me", work.id)).await.unwrap();

        delete_list(&pool, work.id, true).await.unwrap();
        let todos = list_todos(&pool).await.unwrap();
        let moved = todos.iter().find(|todo| todo.id == task.id).unwrap();
        assert_eq!(moved.list_id, inbox);

        let personal = create_list(
            &pool,
            &TodoListInput {
                name: "Personal".into(),
                color: "green".into(),
                icon: "user".into(),
            },
        )
        .await
        .unwrap();
        let task = create_todo(&pool, &input("Delete me", personal.id))
            .await
            .unwrap();
        delete_list(&pool, personal.id, false).await.unwrap();
        assert!(!list_todos(&pool)
            .await
            .unwrap()
            .iter()
            .any(|todo| todo.id == task.id));
    }

    #[tokio::test]
    async fn completing_a_todo_never_touches_pomodoro_data() {
        let pool = crate::db::memory_pool().await;
        let inbox = inbox(&pool).await;

        let pomodoro = crate::services::tasks::create(
            &pool,
            &crate::models::TaskInput {
                title: "Pomodoro task".into(),
                note: String::new(),
                est_slots: 2,
                completed_slots: None,
                tags: Vec::new(),
            },
        )
        .await
        .unwrap();
        crate::services::tasks::set_active(&pool, Some(pomodoro.id))
            .await
            .unwrap();

        let todo = create_todo(&pool, &input("To-do task", inbox)).await.unwrap();
        set_todo_done(&pool, todo.id, true).await.unwrap();

        let tasks = crate::services::tasks::list(&pool).await.unwrap();
        let reloaded = tasks.iter().find(|task| task.id == pomodoro.id).unwrap();
        assert_eq!(reloaded.completed_slots, 0);
        assert!(reloaded.is_active);

        let sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(sessions, 0);

        let active = crate::repositories::app_state::get_i64(
            &mut pool.acquire().await.unwrap(),
            crate::repositories::app_state::ACTIVE_TASK_ID,
        )
        .await
        .unwrap();
        assert_eq!(active, Some(pomodoro.id));
    }

    #[tokio::test]
    async fn reminders_are_created_recomputed_and_removed() {
        let pool = crate::db::memory_pool().await;
        let inbox = inbox(&pool).await;

        let mut with_reminder = input("Submit report", inbox);
        with_reminder.due_date = Some("2031-01-15".into());
        with_reminder.due_time = Some("17:00".into());
        with_reminder.reminder = Some(ReminderInput::Before { lead_minutes: 10 });
        let todo = create_todo(&pool, &with_reminder).await.unwrap();

        let reminder = todo.reminder.expect("a reminder should be stored");
        assert_eq!(reminder.kind, "before");
        assert_eq!(reminder.lead_minutes, Some(10));

        // Changing the due time moves the reminder.
        with_reminder.due_time = Some("18:00".into());
        let updated = update_todo(&pool, todo.id, &with_reminder).await.unwrap();
        assert_ne!(
            updated.reminder.unwrap().fire_at,
            reminder.fire_at,
            "the reminder must follow the new due time"
        );

        // Completing the task removes it, and re-opening does not restore it.
        set_todo_done(&pool, todo.id, true).await.unwrap();
        let reopen = set_todo_done(&pool, todo.id, false).await.unwrap();
        assert!(reopen.reminder.is_none());

        // Deleting also cascades.
        set_todo_done(&pool, todo.id, false).await.unwrap();
        update_todo(&pool, todo.id, &with_reminder).await.unwrap();
        delete_todo(&pool, todo.id).await.unwrap();
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todo_reminders")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn reordering_is_scoped_to_a_list() {
        let pool = crate::db::memory_pool().await;
        let inbox = inbox(&pool).await;
        let work = create_list(
            &pool,
            &TodoListInput {
                name: "Work".into(),
                color: "blue".into(),
                icon: "briefcase".into(),
            },
        )
        .await
        .unwrap();

        let first = create_todo(&pool, &input("First", inbox)).await.unwrap();
        let second = create_todo(&pool, &input("Second", inbox)).await.unwrap();
        create_todo(&pool, &input("Other list", work.id)).await.unwrap();

        move_todo(&pool, second.id, "up").await.unwrap();

        let todos = list_todos(&pool).await.unwrap();
        let inbox_titles: Vec<&str> = todos
            .iter()
            .filter(|todo| todo.list_id == inbox)
            .map(|todo| todo.title.as_str())
            .collect();
        assert_eq!(inbox_titles, vec!["Second", "First"]);

        let first_order = todos.iter().find(|todo| todo.id == first.id).unwrap().sort_order;
        let second_order = todos
            .iter()
            .find(|todo| todo.id == second.id)
            .unwrap()
            .sort_order;
        assert!(second_order < first_order);
    }

    #[tokio::test]
    async fn checklist_items_are_single_level_and_cascade() {
        let pool = crate::db::memory_pool().await;
        let inbox = inbox(&pool).await;
        let todo = create_todo(&pool, &input("Pack bags", inbox)).await.unwrap();

        let item = create_subtask(&pool, todo.id, "Passport").await.unwrap();
        assert_eq!(item.title, "Passport");
        let done = set_subtask_done(&pool, item.id, true).await.unwrap();
        assert!(done.is_done);

        delete_todo(&pool, todo.id).await.unwrap();
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM todo_subtasks")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 0);
    }

    #[test]
    fn a_reminder_needs_a_due_date() {
        let input = TodoInput {
            title: "Task".into(),
            note: String::new(),
            list_id: 1,
            priority: None,
            due_date: None,
            due_time: None,
            reminder: Some(ReminderInput::Due),
        };
        assert!(matches!(
            reminder_spec(
                input.due_date.as_deref(),
                input.due_time.as_deref(),
                input.reminder.as_ref()
            ),
            Err(AppError::Validation { .. })
        ));
    }
}
