//! The system tray icon.
//!
//! The menu and tooltip are driven by the timer engine, so they stay correct
//! even when the main window is closed.

use std::sync::Mutex;

use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::models::{SessionType, TimerSnapshot, TimerStatus};
use crate::state::AppState;
use crate::timer::state::format_clock;

/// Handles we need to keep so the menu text can be updated in place.
pub struct TrayHandles {
    start_pause: MenuItem<Wry>,
    last_tooltip: Mutex<String>,
    last_button_text: Mutex<String>,
}

/// Creates the tray icon. Returns an error if the platform refuses, in which
/// case the app keeps working as a normal window.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let start_pause = MenuItemBuilder::with_id("start_pause", "Start").build(app)?;
    let skip = MenuItemBuilder::with_id("skip", "Skip session").build(app)?;
    let reset = MenuItemBuilder::with_id("reset", "Restart session").build(app)?;
    let show = MenuItemBuilder::with_id("show", "Show PomoDesk").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit PomoDesk").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&start_pause)
        .item(&skip)
        .item(&reset)
        .separator()
        .item(&show)
        .item(&quit)
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        // Left click opens the window; the menu stays on right click.
        .show_menu_on_left_click(false)
        .tooltip("PomoDesk")
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;

    app.manage(TrayHandles {
        start_pause,
        last_tooltip: Mutex::new(String::new()),
        last_button_text: Mutex::new(String::new()),
    });

    Ok(())
}

/// Updates the tooltip ("Focus · 24:13") and the Start/Pause menu label.
pub fn refresh(app: &AppHandle, snapshot: &TimerSnapshot) {
    let Some(handles) = app.try_state::<TrayHandles>() else {
        return;
    };
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };

    let label = match snapshot.session_type {
        SessionType::Focus => "Focus",
        SessionType::ShortBreak => "Short break",
        SessionType::LongBreak => "Long break",
    };
    let tooltip = format!("{label} · {}", format_clock(snapshot.remaining_ms));

    let tooltip_changed = match handles.last_tooltip.lock() {
        Ok(mut last) => {
            if *last == tooltip {
                false
            } else {
                *last = tooltip.clone();
                true
            }
        }
        Err(_) => true,
    };

    if tooltip_changed {
        let _ = tray.set_tooltip(Some(&tooltip));
    }

    let button_text = match snapshot.status {
        TimerStatus::Running => "Pause",
        TimerStatus::Paused => "Resume",
        TimerStatus::Idle => "Start",
    };

    let button_changed = match handles.last_button_text.lock() {
        Ok(mut last) => {
            if *last == button_text {
                false
            } else {
                *last = button_text.to_string();
                true
            }
        }
        Err(_) => true,
    };

    if button_changed {
        let _ = handles.start_pause.set_text(button_text);
    }
}

fn handle_menu_event(app: &AppHandle, id: &str) {
    let app = app.clone();
    let action = id.to_string();

    // Menu callbacks are synchronous, so the database work happens on the
    // async runtime instead of blocking the UI thread.
    tauri::async_runtime::spawn(async move {
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };

        match action.as_str() {
            "start_pause" => {
                let snapshot = state.timer.snapshot().await;
                let result = if snapshot.status == TimerStatus::Running {
                    state.timer.pause().await
                } else {
                    state.timer.start().await
                };
                if let Err(error) = result {
                    eprintln!("[pomodesk] tray start/pause failed: {}", error.message());
                }
            }
            "skip" => {
                if let Err(error) = state.timer.skip().await {
                    eprintln!("[pomodesk] tray skip failed: {}", error.message());
                }
            }
            "reset" => {
                if let Err(error) = state.timer.reset().await {
                    eprintln!("[pomodesk] tray reset failed: {}", error.message());
                }
            }
            "show" => show_window(&app),
            "quit" => app.exit(0),
            _ => {}
        }
    });
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
