import { beforeEach, describe, expect, it, vi } from "vitest";

import { ipc } from "../lib/ipc";
import type { Settings } from "../lib/types";
import { useSettingsStore } from "./settings";

// The store must never pretend a change was saved when the core refused it, so
// these tests replace the real IPC layer with spies.
vi.mock("../lib/ipc", () => ({
  ipc: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

const defaults: Settings = {
  autoStartBreaks: true,
  autoStartFocus: false,
  soundEnabled: true,
  soundId: "",
  notificationsEnabled: true,
  pomodoroNotifications: true,
  todoRemindersEnabled: true,
  minimizeToTray: true,
};

describe("settings store", () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, loading: true, error: null });
    vi.mocked(ipc.getSettings).mockReset();
    vi.mocked(ipc.updateSettings).mockReset();
  });

  it("loads the saved preferences", async () => {
    vi.mocked(ipc.getSettings).mockResolvedValue({ ...defaults, soundEnabled: false });

    await useSettingsStore.getState().load();

    const state = useSettingsStore.getState();
    expect(state.settings?.soundEnabled).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("explains a load failure without throwing", async () => {
    vi.mocked(ipc.getSettings).mockRejectedValue(new Error("offline"));

    await useSettingsStore.getState().load();

    const state = useSettingsStore.getState();
    expect(state.loading).toBe(false);
    expect(state.error).toMatch(/couldn't load your settings/i);
  });

  it("adopts the value the core echoes back", async () => {
    useSettingsStore.setState({ settings: defaults, loading: false });
    vi.mocked(ipc.updateSettings).mockResolvedValue({ ...defaults, autoStartFocus: true });

    await useSettingsStore.getState().save({ ...defaults, autoStartFocus: true });

    expect(useSettingsStore.getState().settings?.autoStartFocus).toBe(true);
  });

  it("rolls back and reports when the core rejects a change", async () => {
    useSettingsStore.setState({ settings: defaults, loading: false });
    vi.mocked(ipc.updateSettings).mockRejectedValue(new Error("refused"));

    await expect(
      useSettingsStore.getState().save({ ...defaults, notificationsEnabled: false }),
    ).rejects.toThrow();

    // The switch must snap back to what is actually stored.
    expect(useSettingsStore.getState().settings?.notificationsEnabled).toBe(true);
  });
});
