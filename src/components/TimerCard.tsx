// The timer card: mode label, cycle progress, ring, clock and controls.
//
// The ring is drawn from the authoritative remaining/total ratio. Between the
// 250 ms ticks we interpolate with requestAnimationFrame so the sweep looks
// smooth without inventing a second source of truth.

import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/cn";
import { cycleLabel, formatClock, MODE_LABEL } from "../lib/format";
import type { TimerSnapshot } from "../lib/types";

const RING_SIZE = 260;
const RING_RADIUS = 116;
const RING_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const MODE_BACKGROUND: Record<TimerSnapshot["sessionType"], string> = {
  focus: "timer-focus",
  short_break: "timer-short",
  long_break: "timer-long",
};

interface TimerCardProps {
  snapshot: TimerSnapshot;
  longBreakEvery: number;
  busy: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
}

export function TimerCard({
  snapshot,
  longBreakEvery,
  busy,
  onToggle,
  onReset,
  onSkip,
}: TimerCardProps) {
  const running = snapshot.status === "running";
  const displayMs = useSmoothRemaining(snapshot.remainingMs, running);

  const progress =
    snapshot.totalMs > 0 ? Math.min(1, Math.max(0, displayMs / snapshot.totalMs)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const mainLabel =
    snapshot.status === "running" ? "Pause" : snapshot.status === "paused" ? "Resume" : "Start";

  const cycle = cycleLabel(snapshot.cycleFocusCount, longBreakEvery);

  return (
    <section
      className={cn(
        "rounded-2xl px-6 py-6 text-white shadow-sm",
        MODE_BACKGROUND[snapshot.sessionType],
      )}
      aria-labelledby="timer-mode-label"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="timer-mode-label"
          className="text-sm font-semibold tracking-wide uppercase"
        >
          {MODE_LABEL[snapshot.sessionType]}
        </h2>
        {cycle ? (
          <p
            className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium tabular-nums"
            title={`${cycle} focus sessions counted towards the next long break`}
          >
            Cycle {cycle}
          </p>
        ) : null}
      </div>

      <div className="relative mx-auto mt-3 aspect-square w-full max-w-[300px]">
        <svg
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="h-full w-full"
          aria-hidden="true"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={RING_WIDTH}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="white"
            strokeWidth={RING_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p
            className="text-6xl font-semibold tabular-nums"
            aria-label={`${MODE_LABEL[snapshot.sessionType]}: ${formatClock(displayMs)} remaining`}
          >
            {formatClock(displayMs)}
          </p>
          {snapshot.status === "paused" ? (
            <p className="mt-2 rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-medium">
              Paused
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className={cn(
            "min-w-[132px] rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900",
            "transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70",
          )}
        >
          {mainLabel}
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          aria-label="Restart the current session"
          title="Restart the current session"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-lg transition-colors hover:bg-white/25 disabled:opacity-50"
        >
          ↺
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          aria-label="Skip to the next session"
          title="Skip to the next session"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-lg transition-colors hover:bg-white/25 disabled:opacity-50"
        >
          ⏭
        </button>
      </div>
    </section>
  );
}

/**
 * Keeps a local millisecond value ticking between core updates.
 * When paused (or when the user prefers reduced motion) it simply mirrors the
 * value from Rust.
 */
function useSmoothRemaining(remainingMs: number, running: boolean): number {
  const [display, setDisplay] = useState(remainingMs);
  const target = useRef(remainingMs);
  target.current = remainingMs;

  // Paused or idle: the core value is final, so show it exactly.
  useEffect(() => {
    if (!running) setDisplay(remainingMs);
  }, [remainingMs, running]);

  useEffect(() => {
    if (!running) return;

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (reduceMotion) return;

    let frame = 0;
    let last = performance.now();

    const step = (time: number) => {
      const delta = time - last;
      last = time;

      setDisplay((previous) => {
        const next = previous - delta;
        // Drifted too far from what the core says? Trust the core.
        if (Math.abs(next - target.current) > 500) return target.current;
        return Math.max(0, next);
      });

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  return display;
}
