// Tauri's build script. It embeds the app metadata and the frontend assets
// into the compiled binary. It must run for both `cargo build` and `cargo test`.
fn main() {
    tauri_build::build()
}
