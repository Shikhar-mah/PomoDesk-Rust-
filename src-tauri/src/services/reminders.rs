//! The reminder scheduler.
//!
//! A single Tokio loop checks pending reminders every 30 seconds. Reminders are
//! claimed before they are shown, so two passes (or two app instances) can never
//! produce the same toast twice.

use std::time::Duration;

use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveTime, TimeZone, Utc};
use sqlx::SqlitePool;
use tauri::AppHandle;

use crate::error::AppError;
use crate::models::{now_utc, parse_sql_timestamp, to_sql_timestamp, DueReminder};
use crate::notifications;
use crate::repositories::todo_reminders as reminder_repo;

/// A reminder older than this is marked fired without a toast, so reopening the
/// app does not nag about stale tasks.
const CATCH_UP_LIMIT_HOURS: i64 = 24;

pub fn spawn(app: AppHandle, pool: SqlitePool) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(30));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            // The first tick fires immediately, which gives us the startup pass.
            ticker.tick().await;
            if let Err(error) = run_pass(&app, &pool).await {
                eprintln!("[pomodesk] reminder check failed: {}", error.message());
            }
        }
    });
}

/// One scheduler pass. Awaited to completion before the next tick, so passes
/// never overlap.
pub async fn run_pass(app: &AppHandle, pool: &SqlitePool) -> Result<(), AppError> {
    let settings = crate::services::settings::get(pool).await.unwrap_or_default();
    if !settings.notifications_enabled || !settings.todo_reminders_enabled {
        return Ok(());
    }

    let now = now_utc();
    let now_sql = to_sql_timestamp(now);

    let pending = {
        let mut conn = pool.acquire().await?;
        reminder_repo::pending_due(&mut conn, &now_sql).await?
    };

    for reminder in pending {
        if reminder.is_done {
            // Defensive clean-up: completion already deletes the row.
            let mut conn = pool.acquire().await?;
            reminder_repo::delete_for_todo(&mut conn, reminder.todo_id).await?;
            continue;
        }

        // Archived lists keep their reminder rows; restoring the list resumes
        // the reminder if it has not fired yet.
        if reminder.archived_at.is_some() {
            continue;
        }

        // Claim before showing. Only the caller that flips `fired_at` notifies.
        let claimed = {
            let mut conn = pool.acquire().await?;
            reminder_repo::mark_fired(&mut conn, reminder.id, &now_sql).await?
        };
        if !claimed {
            continue;
        }

        if is_within_catch_up(&reminder.fire_at, now) {
            notifications::notify_reminder(app, &reminder);
        }
    }

    Ok(())
}

/// True when a missed reminder is recent enough to be worth showing.
pub fn is_within_catch_up(fire_at: &str, now: DateTime<Utc>) -> bool {
    // `fire_at` is a bare SQL timestamp (no offset), always UTC.
    let Some(fired) = parse_sql_timestamp(fire_at).or_else(|| {
        chrono::NaiveDateTime::parse_from_str(fire_at, "%Y-%m-%d %H:%M:%S")
            .ok()
            .map(|naive| Utc.from_utc_datetime(&naive))
    }) else {
        return false;
    };
    let age = now.signed_duration_since(fired);
    age.num_hours() >= -1 && age <= chrono::Duration::hours(CATCH_UP_LIMIT_HOURS)
}

/// Title and body for a reminder toast. Kept pure so it can be tested without a
/// running app.
pub fn reminder_message(reminder: &DueReminder, now: chrono::NaiveDateTime) -> (String, String) {
    let title = truncate(&reminder.title, 60);
    let due = due_label(reminder.due_date.as_deref(), reminder.due_time.as_deref(), now);
    let list = reminder.list_name.trim();

    let overdue = is_overdue(
        reminder.due_date.as_deref(),
        reminder.due_time.as_deref(),
        now,
    );

    let body = if overdue {
        match reminder.due_time.as_deref() {
            Some(time) => format!("Was due at {time} · {list}"),
            None => format!("Was due {due} · {list}"),
        }
    } else {
        let lead = match (reminder.kind.as_str(), reminder.lead_minutes) {
            ("before", Some(minutes)) => format!("Due in {minutes} minutes"),
            ("custom", _) => "Reminder".to_string(),
            _ => "Due now".to_string(),
        };
        format!("{lead} · {due} · {list}")
    };

    (title, body)
}

fn is_overdue(
    due_date: Option<&str>,
    due_time: Option<&str>,
    now: chrono::NaiveDateTime,
) -> bool {
    let Some(date) = due_date.and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
    else {
        return false;
    };
    let time = due_time
        .and_then(|value| NaiveTime::parse_from_str(value, "%H:%M").ok())
        .unwrap_or_else(|| NaiveTime::from_hms_opt(9, 0, 0).expect("09:00 is valid"));
    date.and_time(time) < now
}

fn due_label(
    due_date: Option<&str>,
    due_time: Option<&str>,
    now: chrono::NaiveDateTime,
) -> String {
    let Some(date) = due_date.and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok())
    else {
        return "No due date".to_string();
    };

    let today = now.date();
    let day = if date == today {
        "Today".to_string()
    } else if date == today.succ_opt().unwrap_or(today) {
        "Tomorrow".to_string()
    } else if date == today.pred_opt().unwrap_or(today) {
        "Yesterday".to_string()
    } else {
        format!("{} {}", weekday(date), date.day())
    };

    match due_time {
        Some(time) => format!("{day} at {time}"),
        None => day,
    }
}

fn weekday(date: NaiveDate) -> &'static str {
    match date.weekday() {
        chrono::Weekday::Mon => "Mon",
        chrono::Weekday::Tue => "Tue",
        chrono::Weekday::Wed => "Wed",
        chrono::Weekday::Thu => "Thu",
        chrono::Weekday::Fri => "Fri",
        chrono::Weekday::Sat => "Sat",
        chrono::Weekday::Sun => "Sun",
    }
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut result: String = value.chars().take(max_chars).collect();
    if value.chars().count() > max_chars {
        result.push('…');
    }
    result
}

/// The current local wall-clock time. Exposed for the notification message
/// builder so tests and runtime agree on how "Today" is decided.
pub fn local_now() -> chrono::NaiveDateTime {
    Local::now().naive_local()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder() -> DueReminder {
        DueReminder {
            id: 1,
            todo_id: 2,
            fire_at: "2026-11-24 12:00:00".into(),
            kind: "due".into(),
            lead_minutes: None,
            title: "Submit the report".into(),
            due_date: Some("2026-11-24".into()),
            due_time: Some("12:00".into()),
            is_done: false,
            archived_at: None,
            list_name: "Work".into(),
        }
    }

    #[test]
    fn a_due_reminder_says_so() {
        let now = NaiveDate::from_ymd_opt(2026, 11, 24)
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap();
        let (title, body) = reminder_message(&reminder(), now);
        assert_eq!(title, "Submit the report");
        assert!(body.contains("Due now"));
        assert!(body.contains("Today at 12:00"));
        assert!(body.contains("Work"));
    }

    #[test]
    fn a_late_reminder_is_worded_once_without_nagging() {
        let now = NaiveDate::from_ymd_opt(2026, 11, 24)
            .unwrap()
            .and_hms_opt(14, 0, 0)
            .unwrap();
        let (_, body) = reminder_message(&reminder(), now);
        assert!(body.starts_with("Was due at 12:00"));
    }

    #[test]
    fn a_leading_reminder_mentions_the_lead_time() {
        let mut item = reminder();
        item.kind = "before".into();
        item.lead_minutes = Some(10);
        let now = NaiveDate::from_ymd_opt(2026, 11, 24)
            .unwrap()
            .and_hms_opt(11, 50, 0)
            .unwrap();
        let (_, body) = reminder_message(&item, now);
        assert!(body.contains("Due in 10 minutes"));
    }

    #[test]
    fn long_titles_are_truncated() {
        let mut item = reminder();
        item.title = "x".repeat(100);
        let now = Local::now().naive_local();
        let (title, _) = reminder_message(&item, now);
        assert_eq!(title.chars().count(), 61);
        assert!(title.ends_with('…'));
    }

    #[test]
    fn catch_up_accepts_one_day_and_rejects_older() {
        let now = Utc::now();
        let recent = to_sql_timestamp(now - chrono::Duration::hours(2));
        let old = to_sql_timestamp(now - chrono::Duration::hours(30));
        assert!(is_within_catch_up(&recent, now));
        assert!(!is_within_catch_up(&old, now));
    }

    #[tokio::test]
    async fn a_reminder_can_only_be_claimed_once() {
        let pool = crate::db::memory_pool().await;

        let inbox = crate::services::todos::list_lists(&pool)
            .await
            .unwrap()
            .into_iter()
            .find(|list| list.is_inbox)
            .unwrap();

        let todo = crate::services::todos::create_todo(
            &pool,
            &crate::models::TodoInput {
                title: "One shot".into(),
                note: String::new(),
                list_id: inbox.id,
                priority: None,
                due_date: Some("2031-01-01".into()),
                due_time: Some("09:00".into()),
                reminder: Some(crate::models::ReminderInput::Due),
            },
        )
        .await
        .unwrap();

        let mut conn = pool.acquire().await.unwrap();
        let pending = reminder_repo::pending_due(&mut conn, "2100-01-01 00:00:00")
            .await
            .unwrap();
        let row = pending.iter().find(|r| r.todo_id == todo.id).unwrap();

        let now = to_sql_timestamp(now_utc());
        assert!(reminder_repo::mark_fired(&mut conn, row.id, &now)
            .await
            .unwrap());
        assert!(!reminder_repo::mark_fired(&mut conn, row.id, &now)
            .await
            .unwrap());
    }
}
