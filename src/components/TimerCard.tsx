// The timer card: mode label, cycle progress, ring, clock and controls.
//
// The ring is drawn from the authoritative remaining/total ratio. Between the
// 250 ms ticks we interpolate with requestAnimationFrame so the sweep looks
// smooth without inventing a second source of truth.

import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/cn";
import { cycleLabel, formatClock, formatEndTime, MODE_LABEL } from "../lib/format";
import type { SessionType, TimerSnapshot } from "../lib/types";
import { PauseIcon, PlayIcon, RestartIcon, SkipIcon } from "./ui/Icon";

const RING_SIZE = 260;
const RING_RADIUS = 116;
const RING_WIDTH = 10;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const MODE_CLASS: Record<TimerSnapshot["sessionType"], string> = {
  focus: "timer-card--focus",
  short_break: "timer-card--short",
  long_break: "timer-card--long",
};

interface TimerCardProps {
  snapshot: TimerSnapshot;
  longBreakEvery: number;
  busy: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onSelectMode: (mode: SessionType) => void;
}

export function TimerCard({
  snapshot,
  longBreakEvery,
  busy,
  onToggle,
  onReset,
  onSkip,
  onEnd,
  onSelectMode,
}: TimerCardProps) {
  const running = snapshot.status === "running";
  const displayMs = useSmoothRemaining(snapshot.remainingMs, running);

  const progress =
    snapshot.totalMs > 0 ? Math.min(1, Math.max(0, displayMs / snapshot.totalMs)) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const mainLabel =
    snapshot.status === "running" ? "Pause" : snapshot.status === "paused" ? "Resume" : "Start";

  const cycle = cycleLabel(snapshot.cycleFocusCount, longBreakEvery);
  const endTime = running && snapshot.endsAt ? formatEndTime(snapshot.endsAt) : "";

  return (
    <section
      className={cn("timer-card", MODE_CLASS[snapshot.sessionType])}
      aria-labelledby="timer-mode-label"
    >
      <h2 id="timer-mode-label" className="sr-only">
        {MODE_LABEL[snapshot.sessionType]}
      </h2>

      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Session type" className="timer-tabs">
          {(["focus", "short_break", "long_break"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              className="timer-tab"
              aria-selected={snapshot.sessionType === mode}
              disabled={busy}
              onClick={() => onSelectMode(mode)}
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>
        {cycle ? (
          <p
            className="timer-card__cycle"
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
            className="timer-card__clock"
            aria-label={`${MODE_LABEL[snapshot.sessionType]}: ${formatClock(displayMs)} remaining`}
          >
            {formatClock(displayMs)}
          </p>
          {snapshot.status === "paused" ? (
            <p className="timer-card__status mt-2">Paused</p>
          ) : null}
        </div>
      </div>

      {/* The state of the session, read out when it changes. */}
      <p className="sr-only" role="status">
        {snapshot.status === "running"
          ? `${MODE_LABEL[snapshot.sessionType]} is running.`
          : snapshot.status === "paused"
            ? `${MODE_LABEL[snapshot.sessionType]} is paused.`
            : `${MODE_LABEL[snapshot.sessionType]} is ready to start.`}
      </p>

      {endTime ? <p className="timer-card__ends text-center">Ends at {endTime}</p> : null}

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          className="timer-card__primary"
        >
          {running ? <PauseIcon /> : <PlayIcon />}
          {mainLabel}
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          aria-label="Restart the current session"
          title="Restart the current session"
          className="timer-card__secondary"
        >
          <RestartIcon />
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          aria-label="Skip to the next session"
          title="Skip to the next session"
          className="timer-card__secondary"
        >
          <SkipIcon />
        </button>

        {snapshot.sessionType === "focus" &&
        (snapshot.status === "running" ||
          (snapshot.status === "paused" && snapshot.remainingMs < snapshot.totalMs)) ? (
          <button
            type="button"
            onClick={onEnd}
            disabled={busy}
            aria-label="End this session now and count it as completed"
            title="End this session now and count it as completed"
            className="timer-card__end"
          >
            End
          </button>
        ) : null}
      </div>

      {/* The keyboard shortcuts are announced as well, so nobody has to guess. */}
      <p className="sr-only">
        Shortcuts: Space starts or pauses the timer, R restarts the session, S skips ahead.
      </p>
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
