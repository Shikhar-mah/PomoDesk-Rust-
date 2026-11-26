import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import App from "./App";
import { stopCompletionSound } from "./lib/sound";
import type { Preset, Settings, Task, TimerSnapshot } from "./lib/types";

// The screen is rendered against a fake core: every command the app can send is
// answered here, so a change in the IPC contract breaks this test.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("./lib/sound", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/sound")>();
  return {
    ...actual,
    playCompletionSound: vi.fn(
      () =>
        ({
          addEventListener: vi.fn(),
        }) as unknown as HTMLAudioElement,
    ),
    stopCompletionSound: vi.fn(),
  };
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
  {
    id: 2,
    name: "Deep Work",
    focusSec: 3000,
    shortBreakSec: 600,
    longBreakSec: 1500,
    longBreakEvery: 2,
    sortOrder: 1,
    isBuiltin: true,
  },
];

const settings: Settings = {
  autoStartBreaks: true,
  autoStartFocus: false,
  soundEnabled: true,
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

/**
 * Answers every command the screen sends. A value may be wrapped in a function
 * when the answer has to be produced at call time (a rejection, for example),
 * which keeps the promise from being created — and rejected — too early.
 */
function answerInvokes(overrides: Record<string, unknown> = {}) {
  vi.mocked(invoke).mockImplementation((async (command: string) => {
    const answers: Record<string, unknown> = {
      list_presets: presets,
      list_tasks: [],
      list_todo_lists: [],
      list_todos: [],
      get_timer_state: idleTimer,
      get_settings: settings,
      ...overrides,
    };
    if (!(command in answers)) {
      throw new Error(`unexpected command: ${command}`);
    }
    const answer = answers[command];
    return typeof answer === "function" ? (answer as () => unknown)() : answer;
  }) as never);
}

describe("App", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockClear();
  });

  it("paints the timer, preset tabs and empty task list from the core", async () => {
    answerInvokes();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "PomoDesk" })).toBeInTheDocument();

    // Preset tabs come from list_presets.
    expect(await screen.findByRole("tab", { name: "Classic" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Deep Work" })).toBeInTheDocument();

    // The clock comes from get_timer_state.
    expect(await screen.findByLabelText("Focus: 25:00 remaining")).toBeInTheDocument();

    // The task list starts empty and invites the first task.
    expect(await screen.findByText("No tasks yet")).toBeInTheDocument();

    // And it is subscribed to the core's events.
    expect(listen).toHaveBeenCalledWith("timer:tick", expect.any(Function));
    expect(listen).toHaveBeenCalledWith("timer:session_complete", expect.any(Function));
  });

  it("starts the timer through the core instead of counting down locally", async () => {
    const user = userEvent.setup();
    answerInvokes({
      start_timer: { ...idleTimer, status: "running", endsAt: Date.now() + 1_500_000 },
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Start" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("start_timer", undefined));
    // The button now reflects the state the core reported back.
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("shows a friendly message instead of a stack trace when the core fails", async () => {
    answerInvokes({
      list_tasks: () =>
        Promise.reject({ code: "DATABASE", message: "PomoDesk could not save that change." }),
    });

    render(<App />);

    // The task card reports the failure in plain language.
    expect(
      await screen.findByText(/couldn't load your tasks/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/DATABASE/)).not.toBeInTheDocument();
  });

  it("opens Settings and shows the saved preferences", async () => {
    const user = userEvent.setup();
    answerInvokes();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Start breaks automatically" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Start focus automatically" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("shows the current task and lets the user clear it", async () => {
    const user = userEvent.setup();
    const activeTask: Task = {
      id: 3,
      title: "Write the report",
      note: "",
      estSlots: 3,
      completedSlots: 1,
      isDone: false,
      isActive: true,
      createdAt: "2026-11-12 09:00:00",
      completedAt: null,
      tags: [],
      subtasks: [],
    };
    answerInvokes({ list_tasks: [activeTask], set_active_task: null });

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Working on" })).toBeInTheDocument();

    const workingOn = screen.getByRole("region", { name: "Working on" });
    expect(within(workingOn).getByText("Write the report")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run sessions without counting them against a task" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_active_task", { id: null }),
    );
  });

  it("shows an orphan-session badge when no task is active", async () => {
    answerInvokes({ list_tasks: [] });
    render(<App />);
    expect(await screen.findByText("Orphan session")).toBeInTheDocument();
  });

  it("reports a failed preference change inside the settings dialog", async () => {
    const user = userEvent.setup();
    answerInvokes({
      update_settings: () =>
        Promise.reject({
          code: "DATABASE",
          message: "PomoDesk couldn't save that setting.",
        }),
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("switch", { name: "Play a sound" }));

    // The message has to be inside the dialog: a toast behind the backdrop
    // would be invisible and unclickable.
    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText(/couldn't save that setting/i),
    ).toBeInTheDocument();
  });

  it("saves the notification sound chosen in settings", async () => {
    const user = userEvent.setup();
    answerInvokes();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Settings" }));

    const sound = screen.getByRole("combobox", { name: "Notification sound" });
    expect(
      within(sound).getByRole("option", { name: "Kirby alarm clock" }),
    ).toBeInTheDocument();

    await user.selectOptions(sound, "kirby-alarm-clock-127079");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "update_settings",
        expect.objectContaining({
          settings: expect.objectContaining({ soundId: "kirby-alarm-clock-127079" }),
        }),
      ),
    );
  });

  it("lets the user end a preview and stops it when settings closes", async () => {
    const user = userEvent.setup();
    answerInvokes();

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Settings" }));

    const stop = vi.mocked(stopCompletionSound);
    stop.mockClear();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("button", { name: "Stop preview" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop preview" }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();

    // Starting again and leaving the dialog must not leave the sound ringing.
    await user.click(screen.getByRole("button", { name: "Preview" }));
    stop.mockClear();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(stop).toHaveBeenCalled();
  });

  it("stops a ringing notification when the user finishes the session", async () => {
    const user = userEvent.setup();
    answerInvokes({ skip_session: idleTimer });

    render(<App />);
    const stop = vi.mocked(stopCompletionSound);
    stop.mockClear();

    await user.click(
      await screen.findByRole("button", { name: "Skip to the next session" }),
    );

    expect(stop).toHaveBeenCalled();
  });

  it("counts an ended session when the End button is pressed", async () => {
    const user = userEvent.setup();
    const runningFocus = {
      ...idleTimer,
      status: "running" as const,
      endsAt: Date.now() + 1_500_000,
    };
    answerInvokes({ get_timer_state: runningFocus, end_session: idleTimer });

    render(<App />);

    const endButton = await screen.findByRole("button", { name: /end this session now/i });
    await user.click(endButton);

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("end_session", undefined);
  });


  it("asks before discarding a focus session when switching preset", async () => {
    const user = userEvent.setup();
    answerInvokes({
      start_timer: { ...idleTimer, status: "running", endsAt: Date.now() + 1_500_000 },
      switch_preset: () =>
        Promise.reject({
          code: "NEEDS_CONFIRMATION",
          message:
            'Switch to "Deep Work"? Your current focus session (25:00 left) will be discarded.',
          remainingMs: 1_500_000,
          presetName: "Deep Work",
        }),
    });

    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Start" }));
    await user.click(await screen.findByRole("tab", { name: "Deep Work" }));

    expect(await screen.findByRole("heading", { name: "Switch preset?" })).toBeInTheDocument();
    expect(screen.getByText(/will be discarded/i)).toBeInTheDocument();
  });

  it("switches the session type from the tabs inside the timer card", async () => {
    const user = userEvent.setup();
    answerInvokes({ switch_session_type: idleTimer });

    render(<App />);
    await user.click(await screen.findByRole("tab", { name: "Long break" }));

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("switch_session_type", {
      sessionType: "long_break",
      force: false,
    });
  });
});
