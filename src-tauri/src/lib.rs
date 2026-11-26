//! PomoDesk — application entry point and wiring.
//!
//! Startup order matters:
//!   1. open + migrate the database,
//!   2. rebuild the timer (including crash recovery),
//!   3. share the state with the commands,
//!   4. create the tray icon,
//!   5. start the 250 ms tick loop.

pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod notifications;
pub mod repositories;
pub mod services;
pub mod state;
pub mod timer;
pub mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::Manager;

use tauri_plugin_notification::NotificationExt;

use state::AppState;
use timer::{TauriHost, TimerEngine};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();

            let pool = match tauri::async_runtime::block_on(db::init(&handle)) {
                Ok(pool) => pool,
                Err(error) => fatal(&handle, error.message()),
            };

            let host = Arc::new(TauriHost::new(handle.clone()));
            let timer = match tauri::async_runtime::block_on(TimerEngine::new(pool.clone(), host)) {
                Ok(timer) => timer,
                Err(error) => fatal(&handle, error.message()),
            };

            // The tray-close behaviour is cached so the close handler never has
            // to touch the database on the UI thread.
            let settings =
                tauri::async_runtime::block_on(services::settings::get(&pool)).unwrap_or_default();

            // The scheduler needs its own handle before the pool moves into
            // the managed state.
            let reminder_pool = pool.clone();

            app.manage(AppState {
                pool,
                timer: timer.clone(),
                minimize_to_tray: AtomicBool::new(settings.minimize_to_tray),
                tray_ready: AtomicBool::new(false),
            });

            match tray::setup(&handle) {
                Ok(()) => app
                    .state::<AppState>()
                    .tray_ready
                    .store(true, Ordering::Relaxed),
                Err(error) => {
                    // Without a tray the window must still be closable, so we
                    // leave `tray_ready` false and carry on.
                    eprintln!("[pomodesk] tray icon unavailable: {error:?}");
                }
            }

            // Register the notification categories once, then route every
            // click through the shared handler (session and To-do actions).
            notifications::register_action_types(&handle);

            let notification = handle.notification();
            let handle_for_action = handle.clone();
            let _ = notification.on_action(move |action| {
                notifications::handle_action(handle_for_action.clone(), action.clone());
            });

            timer.spawn_tick_loop();
            services::reminders::spawn(handle.clone(), reminder_pool);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                let hide = state.minimize_to_tray.load(Ordering::Relaxed)
                    && state.tray_ready.load(Ordering::Relaxed);

                if hide {
                    // Closing the window keeps the timer running in the tray.
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::presets::list_presets,
            commands::presets::create_preset,
            commands::presets::update_preset,
            commands::presets::delete_preset,
            commands::tasks::list_tasks,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::set_task_done,
            commands::tasks::delete_task,
            commands::tasks::set_active_task,
            commands::subtasks::create_subtask,
            commands::subtasks::update_subtask,
            commands::subtasks::set_subtask_done,
            commands::subtasks::delete_subtask,
            commands::subtasks::set_active_subtask,
            commands::timer::get_timer_state,
            commands::timer::start_timer,
            commands::timer::pause_timer,
            commands::timer::resume_timer,
            commands::timer::skip_session,
            commands::timer::reset_session,
            commands::timer::end_session,
            commands::timer::switch_session_type,
            commands::timer::switch_preset,
            commands::stats::get_stats_today,
            commands::stats::get_stats_daily,
            commands::stats::get_stats_totals,
            commands::stats::get_streak,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::todos::list_todo_lists,
            commands::todos::create_todo_list,
            commands::todos::update_todo_list,
            commands::todos::set_todo_list_archived,
            commands::todos::delete_todo_list,
            commands::todos::move_todo_list,
            commands::todos::list_todos,
            commands::todos::create_todo,
            commands::todos::update_todo,
            commands::todos::set_todo_done,
            commands::todos::delete_todo,
            commands::todos::move_todo,
            commands::todos::create_todo_subtask,
            commands::todos::update_todo_subtask,
            commands::todos::set_todo_subtask_done,
            commands::todos::delete_todo_subtask,
            commands::todos::snooze_todo_reminder,
        ])
        .run(tauri::generate_context!())
        .expect("PomoDesk failed to start");
}

/// Shows a friendly native dialog and stops the app when startup cannot
/// continue. This is the only path where the user sees an error before the
/// interface exists at all.
fn fatal(app: &tauri::AppHandle, message: &str) -> ! {
    eprintln!("[pomodesk] fatal startup error: {message}");

    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(message)
        .title("PomoDesk can't start")
        .kind(MessageDialogKind::Error)
        .blocking_show();

    std::process::exit(1);
}
