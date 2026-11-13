// Hide the console window on Windows release builds; keep it in development so
// Rust errors stay visible.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pomodesk_lib::run()
}
