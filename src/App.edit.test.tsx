import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import App from "./App";
import type { Preset, Settings, Task, TimerSnapshot } from "./lib/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("./lib/sound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/sound")>();
  return { ...actual, playCompletionSound: vi.fn(), stopCompletionSound: vi.fn() };
});

const presets: Preset[] = [
  {
    id: 1,
    name: "Classic",
    focusSec: 1500,
    shortBreakSec: 300,
    longBreakSec: 900,
    longBreakEvery: 4,
    sortOrder: 0,
    isBuiltin: true,
  },
];
const settings: Settings = {
  autoStartBreaks: true,
  autoStartFocus: false,
  soundEnabled: false,
  soundId: "",
  notificationsEnabled: true,
  pomodoroNotifications: true,
  todoRemindersEnabled: true,
  minimizeToTray: true,
};
const idleTimer: TimerSnapshot = {
  sessionType: "focus",
  status: "idle",
  remainingMs: 1_500_000,
  totalMs: 1_500_000,
  endsAt: null,
  startedAt: null,
  cycleFocusCount: 0,
  activePresetId: 1,
};
const task: Task = {
  id: 7,
  title: "Report",
  note: "",
  estSlots: 2,
  completedSlots: 1,
  isDone: false,
  isActive: false,
  createdAt: "2026-01-01 10:00:00",
  completedAt: null,
  tags: ["work"],
  subtasks: [],
};

describe("App", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockClear();
    vi.mocked(invoke).mockImplementation((async (command: string) => {
      const answers: Record<string, unknown> = {
        list_presets: presets,
        list_tasks: [task],
        list_todo_lists: [],
        list_todos: [],
        get_timer_state: idleTimer,
        get_settings: settings,
        update_task: task,
      };
      return answers[command];
    }) as never);
  });

  it("saves edited pomodoro counts and a new tag from the task dialog", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: 'More actions for "Report"' }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    // There must be exactly one edit dialog: a duplicate (left over from two
    // dialogs sharing the key "none") used to swallow the submit, because the
    // Save button's `form="edit-task-form"` pointed at the stale copy.
    const dialog = await screen.findByRole("dialog", { name: "Edit task" });
    expect(screen.getAllByRole("dialog", { name: "Edit task" })).toHaveLength(1);

    const planned = within(dialog).getByLabelText("Planned");
    expect(planned).toHaveValue(2);
    await user.clear(planned);
    await user.type(planned, "5");

    const done = within(dialog).getByLabelText("Completed");
    expect(done).toHaveValue(1);
    await user.clear(done);
    await user.type(done, "3");

    const tags = within(dialog).getByLabelText("Tags");
    await user.clear(tags);
    await user.type(tags, "work, focus");

    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_task", {
      id: 7,
      input: {
        title: "Report",
        note: "",
        estSlots: 5,
        completedSlots: 3,
        tags: ["work", "focus"],
      },
    });
  });
});
