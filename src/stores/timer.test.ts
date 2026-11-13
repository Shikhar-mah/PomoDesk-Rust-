import { beforeEach, describe, expect, it } from "vitest";

import type { TimerSnapshot } from "../lib/types";
import { useTimerStore } from "./timer";

const snapshot: TimerSnapshot = {
  sessionType: "focus",
  status: "running",
  remainingMs: 1_500_000,
  totalMs: 1_500_000,
  endsAt: 1_700_000_000_000,
  startedAt: "2026-11-12 09:00:00",
  cycleFocusCount: 2,
  activePresetId: 1,
};

describe("timer store", () => {
  beforeEach(() => {
    useTimerStore.setState({ snapshot: null, loading: true, error: null });
  });

  it("adopts a full snapshot from the core", () => {
    useTimerStore.getState().applyState(snapshot);

    const state = useTimerStore.getState();
    expect(state.snapshot).toEqual(snapshot);
    expect(state.loading).toBe(false);
  });

  it("merges a tick without losing the deadline fields", () => {
    useTimerStore.getState().applyState(snapshot);

    useTimerStore.getState().applyTick({
      sessionType: "focus",
      status: "running",
      remainingMs: 1_499_750,
      totalMs: 1_500_000,
      cycleFocusCount: 2,
      activePresetId: 1,
    });

    const current = useTimerStore.getState().snapshot;
    expect(current?.remainingMs).toBe(1_499_750);
    expect(current?.endsAt).toBe(snapshot.endsAt);
    expect(current?.startedAt).toBe(snapshot.startedAt);
  });

  it("can build a snapshot from a tick alone (first paint)", () => {
    useTimerStore.getState().applyTick({
      sessionType: "short_break",
      status: "idle",
      remainingMs: 300_000,
      totalMs: 300_000,
      cycleFocusCount: 3,
      activePresetId: 2,
    });

    const current = useTimerStore.getState().snapshot;
    expect(current?.sessionType).toBe("short_break");
    expect(current?.endsAt).toBeNull();
  });
});
