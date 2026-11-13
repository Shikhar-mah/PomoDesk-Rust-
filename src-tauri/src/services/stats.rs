//! Statistics built from the session log.
//!
//! All day boundaries use the user's local timezone, matching how people think
//! about "today".

use std::collections::HashSet;

use chrono::{Days, Local, NaiveDate};
use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::{DailyStat, StatsToday, StatsTotals};
use crate::repositories::{sessions, tasks as task_repo};

const MAX_DAYS: i64 = 31;

pub async fn today(pool: &SqlitePool) -> Result<StatsToday, AppError> {
    let mut conn = pool.acquire().await?;

    let totals = sessions::totals_for_today(&mut conn).await?;
    let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let tasks_completed = task_repo::count_completed_on(&mut conn, &today).await?;

    Ok(StatsToday {
        sessions: totals.sessions,
        focus_minutes: totals.seconds / 60,
        tasks_completed,
    })
}

/// One entry per day for the last `days` days, oldest first. Days with no
/// sessions are included with zeroes so the bar chart has a stable width.
pub async fn daily(pool: &SqlitePool, days: i64) -> Result<Vec<DailyStat>, AppError> {
    let days = days.clamp(1, MAX_DAYS);
    let mut conn = pool.acquire().await?;

    let rows = sessions::totals_per_day(&mut conn, days).await?;
    let mut by_day: std::collections::HashMap<String, (i64, i64)> = rows
        .into_iter()
        .map(|row| (row.day, (row.sessions, row.seconds)))
        .collect();

    let today = Local::now().date_naive();
    let mut result = Vec::with_capacity(days as usize);

    for offset in (0..days).rev() {
        let Some(day) = today.checked_sub_days(Days::new(offset as u64)) else {
            continue;
        };
        let key = day.format("%Y-%m-%d").to_string();
        let (session_count, seconds) = by_day.remove(&key).unwrap_or((0, 0));
        result.push(DailyStat {
            date: key,
            sessions: session_count,
            minutes: seconds / 60,
        });
    }

    Ok(result)
}

pub async fn totals(pool: &SqlitePool) -> Result<StatsTotals, AppError> {
    let mut conn = pool.acquire().await?;
    let totals = sessions::totals_all_time(&mut conn).await?;
    let days = sessions::distinct_days(&mut conn).await?;

    Ok(StatsTotals {
        sessions: totals.sessions,
        focus_minutes: totals.seconds / 60,
        streak_days: streak_from_days(&days, Local::now().date_naive()),
    })
}

pub async fn streak(pool: &SqlitePool) -> Result<i64, AppError> {
    let mut conn = pool.acquire().await?;
    let days = sessions::distinct_days(&mut conn).await?;
    Ok(streak_from_days(&days, Local::now().date_naive()))
}

/// Consecutive days with at least one completed focus session, counting back
/// from today (or from yesterday, if today has no session yet). This means a
/// streak is not "lost" just because the user has not started today.
fn streak_from_days(days: &[String], today: NaiveDate) -> i64 {
    let mut present: HashSet<NaiveDate> = days
        .iter()
        .filter_map(|day| NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
        .collect();

    let yesterday = today.checked_sub_days(Days::new(1));

    let mut cursor = if present.contains(&today) {
        Some(today)
    } else {
        yesterday.filter(|day| present.contains(day))
    };

    let mut streak = 0;
    while let Some(day) = cursor {
        // `insert` returns false when the day is already present, so `remove`
        // tells us whether this day actually had a session.
        if !present.remove(&day) {
            break;
        }
        streak += 1;
        cursor = day.checked_sub_days(Days::new(1));
    }

    streak
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn day(offset: i64) -> String {
        (Local::now().date_naive() - Duration::days(offset))
            .format("%Y-%m-%d")
            .to_string()
    }

    #[test]
    fn streak_counts_back_from_today() {
        let today = Local::now().date_naive();
        let days = vec![day(0), day(1), day(2), day(4)];
        assert_eq!(streak_from_days(&days, today), 3);
    }

    #[test]
    fn streak_survives_a_day_that_has_not_started_yet() {
        let today = Local::now().date_naive();
        let days = vec![day(1), day(2)];
        assert_eq!(streak_from_days(&days, today), 2);
    }

    #[test]
    fn streak_is_zero_without_recent_sessions() {
        let today = Local::now().date_naive();
        assert_eq!(streak_from_days(&[], today), 0);
        assert_eq!(streak_from_days(&[day(3)], today), 0);
    }

    #[tokio::test]
    async fn stats_only_count_completed_sessions() {
        let pool = crate::db::memory_pool().await;

        let mut tx = pool.begin().await.unwrap();
        for _ in 0..3 {
            sessions::insert(
                &mut tx,
                &sessions::NewSession {
                    preset_id: None,
                    preset_name: "Classic".to_string(),
                    task_id: None,
                    task_title: None,
                    started_at: format!("{} 09:00:00", day(0)),
                    ended_at: format!("{} 09:25:00", day(0)),
                    duration_sec: 1500,
                },
            )
            .await
            .unwrap();
        }
        sessions::insert(
            &mut tx,
            &sessions::NewSession {
                preset_id: None,
                preset_name: "Classic".to_string(),
                task_id: None,
                task_title: None,
                started_at: format!("{} 09:00:00", day(1)),
                ended_at: format!("{} 09:25:00", day(1)),
                duration_sec: 1500,
            },
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        let today_stats = today(&pool).await.unwrap();
        assert_eq!(today_stats.sessions, 3);
        assert_eq!(today_stats.focus_minutes, 75);

        let week = daily(&pool, 7).await.unwrap();
        assert_eq!(week.len(), 7);
        assert_eq!(week.last().unwrap().sessions, 3);
        assert_eq!(week[week.len() - 2].sessions, 1);

        let totals = totals(&pool).await.unwrap();
        assert_eq!(totals.sessions, 4);
        assert_eq!(totals.streak_days, 2);
    }
}
