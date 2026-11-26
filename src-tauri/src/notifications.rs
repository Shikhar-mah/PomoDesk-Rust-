//! Shared notification construction and action dispatch.
//!
//! Action types are registered once at startup. Toasts carry the data the
//! handler needs (`todoId`, `reminderId`, a `kind` tag), so the handler never
//! has to guess what a click was about.

use std::collections::HashMap;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::{Action, ActionPerformed, ActionType, NotificationExt};

use crate::models::{DueReminder, SessionType};
use crate::state::AppState;

/// Registers every action type the app can show. Called once from setup.
pub fn register_action_types(app: &AppHandle) {
    let session = ActionType::builder("pomodesk-session")
        .actions(vec![
            Action::builder("close", "Close").build(),
            Action::builder("start", "Start next session").build(),
        ])
        .build();

    let todo = ActionType::builder("pomodesk-todo")
        .actions(vec![
            Action::builder("todo-open", "Open").build(),
            Action::builder("todo-done", "Done").build(),
            Action::builder("todo-snooze", "Snooze 10 min").build(),
        ])
        .build();

    if let Err(error) = app
        .notification()
        .register_action_types(vec![session, todo])
    {
        eprintln!("[pomodesk] could not register notification actions: {error:?}");
    }
}

/// A Pomodoro session-completion toast. The label of the "start" action follows
/// the type of the session that comes next.
pub fn notify_session(app: &AppHandle, title: &str, body: &str, next: SessionType) {
    let action_label = match next {
        SessionType::Focus => "Start session",
        SessionType::ShortBreak | SessionType::LongBreak => "Start break",
    };

    let action_type = ActionType::builder("pomodesk-session")
        .actions(vec![
            Action::builder("close", "Close").build(),
            Action::builder("start", action_label).build(),
        ])
        .build();

    // Re-registering is cheap and keeps the correct label even if setup ran
    // before the plugin was ready on a platform.
    if let Err(error) = app.notification().register_action_types(vec![action_type]) {
        eprintln!("[pomodesk] could not register notification actions: {error:?}");
    }

    let builder = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .action_type_id("pomodesk-session");

    if let Err(error) = builder.show() {
        eprintln!("[pomodesk] notification failed: {error:?}");
    }
}

/// A To-do reminder toast with Open / Done / Snooze actions.
pub fn notify_reminder(app: &AppHandle, reminder: &DueReminder) {
    let (title, body) =
        crate::services::reminders::reminder_message(reminder, crate::services::reminders::local_now());

    let builder = app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .action_type_id("pomodesk-todo")
        .extra("kind", "todo_reminder")
        .extra("todoId", reminder.todo_id)
        .extra("reminderId", reminder.id);

    if let Err(error) = builder.show() {
        eprintln!("[pomodesk] reminder notification failed: {error:?}");
    }
}

/// Handles a notification click. All data is copied out of the action before
/// the async work starts, because the action reference is not `'static`.
pub fn handle_action(app: AppHandle, action: ActionPerformed) {
    let action_id = action.action_id().to_string();
    let extra: HashMap<String, Value> = action
        .notification()
        .map(|notification| notification.extra().clone())
        .unwrap_or_default();

    tauri::async_runtime::spawn(async move {
        let kind = extra.get("kind").and_then(Value::as_str).unwrap_or_default();
        let todo_id = extra.get("todoId").and_then(Value::as_i64);

        if kind == "todo_reminder" {
            handle_todo_action(&app, &action_id, todo_id).await;
        } else {
            handle_session_action(&app, &action_id).await;
        }
    });
}

async fn handle_todo_action(app: &AppHandle, action_id: &str, todo_id: Option<i64>) {
    match action_id {
        "tap" | "todo-open" => {
            crate::tray::show_window(app);
            if let Some(todo_id) = todo_id {
                emit(app, "todos:reveal", serde_json::json!({ "todoId": todo_id }));
            }
        }
        "todo-done" => {
            if let Some(todo_id) = todo_id {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Err(error) =
                        crate::services::todos::set_todo_done(&state.pool, todo_id, true).await
                    {
                        eprintln!("[pomodesk] could not complete To-do: {}", error.message());
                    } else {
                        emit(app, "todos:changed", Value::Null);
                    }
                }
            }
            emit(app, "notification:closed", Value::Null);
        }
        "todo-snooze" => {
            if let Some(todo_id) = todo_id {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Err(error) =
                        crate::services::todos::snooze_reminder(&state.pool, todo_id, 10).await
                    {
                        eprintln!("[pomodesk] could not snooze reminder: {}", error.message());
                    } else {
                        emit(app, "todos:changed", Value::Null);
                    }
                }
            }
            emit(app, "notification:closed", Value::Null);
        }
        "close" | "dismiss" => emit(app, "notification:closed", Value::Null),
        _ => {}
    }
}

async fn handle_session_action(app: &AppHandle, action_id: &str) {
    match action_id {
        "tap" => crate::tray::show_window(app),
        "close" | "dismiss" => emit(app, "notification:closed", Value::Null),
        "start" => {
            if let Some(state) = app.try_state::<AppState>() {
                if let Err(error) = state.timer.start().await {
                    eprintln!("[pomodesk] notification start failed: {}", error.message());
                }
            }
            // Keep the window closed so the next session can start in the
            // background, but stop the ringing chime.
            emit(app, "notification:closed", Value::Null);
        }
        _ => {}
    }
}

fn emit(app: &AppHandle, event: &str, payload: Value) {
    if let Err(error) = app.emit(event, payload) {
        eprintln!("[pomodesk] could not emit {event}: {error:?}");
    }
}
