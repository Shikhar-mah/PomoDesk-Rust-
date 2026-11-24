// Small presentation helpers. These format values only — the Rust core is the
// authority on all timer maths.

import type { SessionType } from "./types";

export const MODE_LABEL: Record<SessionType, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
};

/** `remainingMs` → `"24:13"`. Rounds up, so a fresh timer reads its full time. */
export function formatClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * "How far through the current cycle are we" as `done/needed`.
 * A finished cycle shows `4/4` until the long break resets the counter.
 */
export function cycleLabel(cycleFocusCount: number, every: number): string {
  if (every <= 0) return "";
  const remainder = cycleFocusCount % every;
  const done = remainder === 0 && cycleFocusCount > 0 ? every : remainder;
  return `${done}/${every}`;
}

/** Minutes → `"1h 15m"` or `"25m"` or `"0m"`. */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** `"2026-11-08"` → `"Sun"`. Used under the weekly bars. */
export function weekdayLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * A wall-clock time as the user sees it on their own machine, e.g. `"3:45 PM"`.
 * Used to say when the running session will end.
 */
export function formatEndTime(endsAt: number): string {
  const parsed = new Date(endsAt);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Adds one to a number and keeps it inside `min…max`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
