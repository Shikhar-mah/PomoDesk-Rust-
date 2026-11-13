import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import App from "./App";
import type { Preset, Settings, TimerSnapshot } from "./lib/types";

// The screen is rendered against a fake core: every command the app can send is
// answered here, so a change in the IPC contract breaks this test.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

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
  notificationsEnabled: true,
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
});
