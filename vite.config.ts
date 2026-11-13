/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite is only the dev server / bundler for the React view.
// The actual application (timer, database) lives in the Rust core.
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Tauri shows Rust compiler output in the same terminal, so we must not clear it.
  clearScreen: false,

  server: {
    // This exact port is what src-tauri/tauri.conf.json points at.
    port: 1420,
    strictPort: true,
    // Watching src-tauri would trigger pointless webview reloads.
    watch: { ignored: ["**/src-tauri/**"] },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
