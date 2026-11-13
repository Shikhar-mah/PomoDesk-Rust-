// Wiring between Rust events and the zustand stores.
//
// The timer is authoritative in Rust: these listeners only copy what the core
// broadcasts into the stores. Nothing here calculates time.

import { listen } from "@tauri-apps/api/event";

import { usePresetsStore } from "../stores/presets";
import { useSettingsStore } from "../stores/settings";
import { useTasksStore } from "../stores/tasks";
import { useTimerStore } from "../stores/timer";
import { playCompletionSound } from "./sound";
import type { SessionCompletePayload, TickPayload, TimerSnapshot } from "./types";

/**
 * Subscribes to every core event and returns a cleanup function for unmount.
 */
export function bindCoreEvents(): () => void {
  const unlisteners: Array<() => void> = [];
  let cancelled = false;

  const register = async () => {
    try {
      const tick = await listen<TickPayload>("timer:tick", (event) => {
        useTimerStore.getState().applyTick(event.payload);
      });
      const stateChanged = await listen<TimerSnapshot>("timer:state_changed", (event) => {
        useTimerStore.getState().applyState(event.payload);
      });
      const complete = await listen<SessionCompletePayload>(
        "timer:session_complete",
        () => {
          if (useSettingsStore.getState().settings?.soundEnabled) {
            playCompletionSound();
          }
          // A finished focus session may have credited the active task.
          void useTasksStore.getState().load();
        },
      );
      const tasksChanged = await listen("tasks:changed", () => {
        void useTasksStore.getState().load();
      });
      const presetsChanged = await listen("presets:changed", () => {
        void usePresetsStore.getState().load();
      });

      if (cancelled) {
        for (const stop of [tick, stateChanged, complete, tasksChanged, presetsChanged]) {
          stop();
        }
        return;
      }

      unlisteners.push(tick, stateChanged, complete, tasksChanged, presetsChanged);
    } catch {
      // Running in a plain browser instead of the desktop shell; the UI still
      // renders and its own error banners explain what is unavailable.
    }
  };

  void register();

  return () => {
    cancelled = true;
    for (const stop of unlisteners) stop();
  };
}
