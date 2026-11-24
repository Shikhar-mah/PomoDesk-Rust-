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
pub mod repositories;
pub mod services;
pub mod state;
pub mod timer;
pub mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{Emitter, Manager};

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

            // Wire notification button clicks (Close / Start) and taps to the
            // app: tapping opens the window, Close stops the ringing sound,
            // Start kicks off the next session.
            let notification = handle.notification();
            let handle_for_action = handle.clone();
            let _ = notification.on_action(move |action| {
                let app = handle_for_action.clone();
                let action_id = action.action_id().to_string();
                tauri::async_runtime::spawn(async move {
                    let Some(state) = app.try_state::<AppState>() else {
                        return;
                    };
                    match action_id.as_str() {
                        "tap" => tray::show_window(&app),
                        "close" | "dismiss" => {
                            let _ = app.emit("notification:closed", ());
                        }
                        "start" => {
                            if let Err(error) = state.timer.start().await {
                                eprintln!("[pomodesk] notification start failed: {}", error.message());
                            }
                            // Stop the ringing chime; do NOT open the window, so
                            // the user can keep working while the next session
                            // starts in the background.
                            let _ = app.emit("notification:closed", ());
                        }
                        _ => {}
                    }
                });
            });

            timer.spawn_tick_loop();
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
