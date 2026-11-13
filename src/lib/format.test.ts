import { describe, expect, it } from "vitest";

import { cycleLabel, formatClock, formatMinutes, clamp, weekdayLabel } from "./format";

describe("formatClock", () => {
  it("shows the full duration the moment a session starts", () => {
    expect(formatClock(25 * 60 * 1000)).toBe("25:00");
  });

  it("rounds up so the last second is visible", () => {
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(1001)).toBe("00:02");
    expect(formatClock(0)).toBe("00:00");
  });

  it("never shows negative time", () => {
    expect(formatClock(-5000)).toBe("00:00");
  });
});

describe("cycleLabel", () => {
  it("counts completed focus sessions in the cycle", () => {
    expect(cycleLabel(0, 4)).toBe("0/4");
    expect(cycleLabel(2, 4)).toBe("2/4");
  });

  it("keeps showing a full cycle until the long break resets it", () => {
    expect(cycleLabel(4, 4)).toBe("4/4");
  });

  it("handles a preset with no long-break cycle", () => {
    expect(cycleLabel(3, 0)).toBe("");
  });
});

describe("formatMinutes", () => {
  it("reads naturally", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(25)).toBe("25m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(75)).toBe("1h 15m");
  });
});

describe("weekdayLabel", () => {
  it("returns an empty string for an unreadable date", () => {
    expect(weekdayLabel("not-a-date")).toBe("");
  });

  it("returns a short weekday for a real date", () => {
    expect(weekdayLabel("2026-11-12").length).toBeGreaterThan(0);
  });
});

describe("clamp", () => {
  it("keeps values inside the range", () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(0, 1, 10)).toBe(1);
    expect(clamp(11, 1, 10)).toBe(10);
    expect(clamp(Number.NaN, 1, 10)).toBe(1);
  });
});
