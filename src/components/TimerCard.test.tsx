import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TimerSnapshot } from "../lib/types";
import { TimerCard } from "./TimerCard";

function snapshot(overrides: Partial<TimerSnapshot> = {}): TimerSnapshot {
  return {
    sessionType: "focus",
    status: "idle",
    remainingMs: 25 * 60 * 1000,
    totalMs: 25 * 60 * 1000,
    endsAt: null,
    startedAt: null,
    cycleFocusCount: 0,
    activePresetId: 1,
    ...overrides,
  };
}

function renderCard(overrides: Partial<TimerSnapshot> = {}) {
  const handlers = { onToggle: vi.fn(), onReset: vi.fn(), onSkip: vi.fn(), onEnd: vi.fn(), onSelectMode: vi.fn() };
  render(<TimerCard snapshot={snapshot(overrides)} longBreakEvery={4} busy={false} {...handlers} />);
  return handlers;
}

describe("TimerCard", () => {
  it("labels the session and shows the full duration before it starts", () => {
    renderCard();

    expect(screen.getByRole("heading", { name: "Focus" })).toBeInTheDocument();
    expect(screen.getByLabelText("Focus: 25:00 remaining")).toBeInTheDocument();
    expect(screen.getByText("Cycle 0/4")).toBeInTheDocument();
  });

  it("offers Start when idle, Pause while running and Resume when paused", () => {
    const { unmount } = render(
      <TimerCard
        snapshot={snapshot({ status: "idle" })}
        longBreakEvery={4}
        busy={false}
        onToggle={vi.fn()}
        onReset={vi.fn()}
        onSkip={vi.fn()}
        onEnd={vi.fn()}
        onSelectMode={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    unmount();

    render(
      <TimerCard
        snapshot={snapshot({ status: "running", endsAt: Date.now() + 60_000 })}
        longBreakEvery={4}
        busy={false}
        onToggle={vi.fn()}
        onReset={vi.fn()}
        onSkip={vi.fn()}
        onEnd={vi.fn()}
        onSelectMode={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("says Paused and shows the remaining time", () => {
    renderCard({ status: "paused", remainingMs: 12 * 60 * 1000 + 34_000 });

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByLabelText("Focus: 12:34 remaining")).toBeInTheDocument();
  });

  it("shows the break mode instead of Focus", () => {
    renderCard({ sessionType: "long_break", remainingMs: 15 * 60 * 1000, totalMs: 15 * 60 * 1000 });

    expect(screen.getByRole("heading", { name: "Long break" })).toBeInTheDocument();
  });

  it("says when the running session will end", () => {
    renderCard({ status: "running", endsAt: new Date(2026, 0, 1, 15, 45).getTime() });

    expect(screen.getByText(/Ends at/)).toBeInTheDocument();
  });

  it("forwards the three controls and disables them while busy", async () => {
    const user = userEvent.setup();
    const { onToggle, onReset, onSkip } = renderCard();

    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Restart the current session" }));
    await user.click(screen.getByRole("button", { name: "Skip to the next session" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("ignores clicks while an action is in flight", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <TimerCard
        snapshot={snapshot()}
        longBreakEvery={4}
        busy
        onToggle={onToggle}
        onReset={vi.fn()}
        onSkip={vi.fn()}
        onEnd={vi.fn()}
        onSelectMode={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
