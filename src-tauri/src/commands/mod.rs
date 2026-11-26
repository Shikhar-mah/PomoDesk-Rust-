//! Tauri commands: the thin boundary between the React view and the services.
//!
//! Commands only parse arguments, call a service and (when something shared
//! changed) notify the rest of the app. No SQL and no business rules here.

pub mod presets;
pub mod settings;
pub mod stats;
pub mod subtasks;
pub mod tasks;
pub mod timer;
pub mod todos;
