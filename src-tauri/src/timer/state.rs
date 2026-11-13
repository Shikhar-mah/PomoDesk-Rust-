//! Pure timer logic: no database, no Tauri, no async.
//!
//! Keeping these functions free of side effects is what makes the state machine
//! easy to test — every rule from the architecture document has a matching test
//! at the bottom of this file.

use chrono::Utc;

use crate::models::{Preset, SessionType, TimerSnapshot, TimerStatus};

pub fn now_ms() -> i64 {
    Utc::now().timestamp_millis()
}

/// Full length of one session, in milliseconds.
pub fn duration_ms(preset: &Preset, kind: SessionType) -> i64 {
    let seconds = match kind {
        SessionType::Focus => preset.focus_sec,
        SessionType::ShortBreak => preset.short_break_sec,
        SessionType::LongBreak => preset.long_break_sec,
    };
    seconds.max(1) * 1000
}

pub fn fresh_focus(preset: &Preset, cycle_focus_count: i64) -> TimerSnapshot {
    let total = duration_ms(preset, SessionType::Focus);
    TimerSnapshot {
        session_type: SessionType::Focus,
        status: TimerStatus::Idle,
        remaining_ms: total,
        total_ms: total,
        ends_at: None,
        started_at: None,
        cycle_focus_count,
        active_preset_id: preset.id,
    }
}

/// "Mid-session" is what triggers the "discard this focus?" confirmation.
/// Breaks never trigger it.
pub fn is_mid_session(snapshot: &TimerSnapshot) -> bool {
    snapshot.session_type == SessionType::Focus
        && (snapshot.status == TimerStatus::Running
            || (snapshot.status == TimerStatus::Paused
                && snapshot.remaining_ms < snapshot.total_ms))
}

/// True when the focus session that just finished completes a full cycle.
/// `cycle_after_increment` is the counter *including* the session that finished.
pub fn long_break_due(cycle_after_increment: i64, long_break_every: i64) -> bool {
    long_break_every > 0
        && cycle_after_increment > 0
        && cycle_after_increment % long_break_every == 0
}

pub fn next_break_type(cycle_after_increment: i64, long_break_every: i64) -> SessionType {
    if long_break_due(cycle_after_increment, long_break_every) {
        SessionType::LongBreak
    } else {
        SessionType::ShortBreak
    }
}

/// The UI shows whole seconds, rounded up, so a fresh 25:00 timer reads 25:00
/// for a moment instead of jumping to 24:59 immediately.
pub fn display_seconds(remaining_ms: i64) -> i64 {
    ((remaining_ms.max(0) as f64) / 1000.0).ceil() as i64
}

pub fn format_clock(remaining_ms: i64) -> String {
    let total = display_seconds(remaining_ms);
    format!("{:02}:{:02}", total / 60, total % 60)
}

/// Moves the state to another session type. Used by skip, reset, preset switch
/// and the completion pipeline.
pub fn advance_to(
    state: &mut TimerSnapshot,
    next: SessionType,
    preset: &Preset,
    auto_start: bool,
    now_ms: i64,
) {
    let total = duration_ms(preset, next);
    state.session_type = next;
    state.total_ms = total;
    state.remaining_ms = total;
    state.started_at = None;
    state.status = if auto_start {
        TimerStatus::Running
    } else {
        TimerStatus::Idle
    };
    state.ends_at = if auto_start {
        Some(now_ms + total)
    } else {
        None
    };
}

/// Rebuilds a running session's remaining time from its absolute deadline.
/// This is why the timer cannot drift when the window is minimised: the only
/// source of truth is a wall-clock timestamp.
pub fn remaining_from_deadline(ends_at: i64, now_ms: i64) -> i64 {
    (ends_at - now_ms).max(0)
}

/// Applies the crash-recovery rules:
/// * a focus session that was running comes back **paused** at the remaining
///   time (or at zero if its deadline already passed, so it completes on the
///   next resume);
/// * a break that was interrupted is discarded and we start from a fresh focus.
pub fn restore(
    saved: &TimerSnapshot,
    preset: &Preset,
    cycle_focus_count: i64,
    now_ms: i64,
) -> TimerSnapshot {
    if saved.session_type.is_break() {
        return fresh_focus(preset, cycle_focus_count);
    }

    let total = duration_ms(preset, SessionType::Focus);
    let mut restored = TimerSnapshot {
        session_type: SessionType::Focus,
        status: TimerStatus::Idle,
        remaining_ms: total,
        total_ms: total,
        ends_at: None,
        started_at: saved.started_at.clone(),
        cycle_focus_count,
        active_preset_id: preset.id,
    };

    match saved.status {
        TimerStatus::Running => {
            let ends_at = saved.ends_at.unwrap_or(now_ms);
            restored.status = TimerStatus::Paused;
            restored.remaining_ms = remaining_from_deadline(ends_at, now_ms);
        }
        TimerStatus::Paused => {
            restored.status = TimerStatus::Paused;
            restored.remaining_ms = saved.remaining_ms.max(0);
        }
        TimerStatus::Idle => {
            // Nothing was in progress, so there is no meaningful start time.
            restored.status = TimerStatus::Idle;
            restored.remaining_ms = total;
            restored.started_at = None;
        }
    }

    // A paused session that never actually ran can be treated as a normal idle
    // one, so the Start button does not say "Paused" for nothing. A paused
    // session at exactly zero is deliberately kept paused: resuming it is what
    // makes the session complete (and get credited) exactly once.
    let never_started = restored.status == TimerStatus::Paused
        && restored.remaining_ms > 0
        && restored.remaining_ms >= total;

    if never_started {
        restored.status = TimerStatus::Idle;
        restored.started_at = None;
    }

    restored
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Preset;

    fn preset(every: i64) -> Preset {
        Preset {
            id: 1,
            name: "Classic".into(),
            focus_sec: 25 * 60,
            short_break_sec: 5 * 60,
            long_break_sec: 15 * 60,
            long_break_every: every,
            sort_order: 0,
            is_builtin: true,
        }
    }

    fn running_snapshot(total_ms: i64, ends_at: i64) -> TimerSnapshot {
        TimerSnapshot {
            session_type: SessionType::Focus,
            status: TimerStatus::Running,
            remaining_ms: total_ms,
            total_ms,
            ends_at: Some(ends_at),
            started_at: Some("2026-01-01 10:00:00".into()),
            cycle_focus_count: 0,
            active_preset_id: 1,
        }
    }

    #[test]
    fn a_focus_session_is_mid_session_only_while_it_has_progress() {
        let total = 25 * 60 * 1000;

        let mut running = running_snapshot(total, 0);
        running.status = TimerStatus::Running;
        assert!(is_mid_session(&running));

        running.status = TimerStatus::Paused;
        running.remaining_ms = total;
        assert!(
            !is_mid_session(&running),
            "paused at full length = not started"
        );

        running.remaining_ms = total - 1000;
        assert!(
            is_mid_session(&running),
            "paused with progress = mid-session"
        );

        running.session_type = SessionType::ShortBreak;
        assert!(!is_mid_session(&running), "breaks never interrupt");
    }

    #[test]
    fn long_break_is_due_on_every_nth_focus_session() {
        assert!(!long_break_due(0, 4));
        assert!(!long_break_due(1, 4));
        assert!(long_break_due(4, 4));
        assert!(long_break_due(8, 4));
        assert!(long_break_due(2, 2));
        assert!(!long_break_due(3, 2));
    }

    #[test]
    fn break_selection_matches_the_cycle() {
        assert_eq!(next_break_type(1, 4), SessionType::ShortBreak);
        assert_eq!(next_break_type(4, 4), SessionType::LongBreak);
        assert_eq!(next_break_type(2, 2), SessionType::LongBreak);
    }

    #[test]
    fn clock_rounds_up_so_a_full_minute_is_visible() {
        assert_eq!(format_clock(25 * 60 * 1000), "25:00");
        assert_eq!(format_clock(24 * 60 * 1000 + 1), "24:01");
        assert_eq!(format_clock(0), "00:00");
        assert_eq!(display_seconds(1), 1);
        assert_eq!(display_seconds(1001), 2);
    }

    #[test]
    fn restoring_a_running_session_pauses_it_at_the_remaining_time() {
        let now = 1_000_000;
        let saved = running_snapshot(25 * 60 * 1000, now + 60_000);

        let restored = restore(&saved, &preset(4), 2, now);

        assert_eq!(restored.status, TimerStatus::Paused);
        assert_eq!(restored.remaining_ms, 60_000);
        assert_eq!(restored.ends_at, None);
        assert_eq!(restored.cycle_focus_count, 2);
    }

    #[test]
    fn restoring_an_expired_session_leaves_it_at_zero_to_complete_later() {
        let now = 1_000_000;
        let saved = running_snapshot(25 * 60 * 1000, now - 5_000);

        let restored = restore(&saved, &preset(4), 0, now);

        assert_eq!(restored.status, TimerStatus::Paused);
        assert_eq!(restored.remaining_ms, 0);
    }

    #[test]
    fn restoring_an_interrupted_break_starts_a_fresh_focus() {
        let now = 1_000_000;
        let mut saved = running_snapshot(5 * 60 * 1000, now + 60_000);
        saved.session_type = SessionType::LongBreak;

        let restored = restore(&saved, &preset(4), 3, now);

        assert_eq!(restored.session_type, SessionType::Focus);
        assert_eq!(restored.status, TimerStatus::Idle);
        assert_eq!(restored.cycle_focus_count, 3);
    }

    #[test]
    fn advancing_sets_the_full_length_of_the_next_session() {
        let mut state = running_snapshot(25 * 60 * 1000, 0);
        advance_to(&mut state, SessionType::LongBreak, &preset(4), false, 0);

        assert_eq!(state.total_ms, 15 * 60 * 1000);
        assert_eq!(state.remaining_ms, 15 * 60 * 1000);
        assert_eq!(state.status, TimerStatus::Idle);
        assert!(state.ends_at.is_none());
    }
}
