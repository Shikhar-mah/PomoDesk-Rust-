// Statistics panel: today, the last seven days, and all-time figures.
// Data is fetched only while the panel is open.

import { useEffect } from "react";

import { formatMinutes, weekdayLabel } from "../lib/format";
import { useStatsStore } from "../stores/stats";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";
import { Button } from "./ui/Button";

interface StatsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function StatsPanel({ open, onClose }: StatsPanelProps) {
  const today = useStatsStore((state) => state.today);
  const daily = useStatsStore((state) => state.daily);
  const totals = useStatsStore((state) => state.totals);
  const loading = useStatsStore((state) => state.loading);
  const error = useStatsStore((state) => state.error);
  const load = useStatsStore((state) => state.load);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const weekHasData = daily.some((day) => day.sessions > 0);
  const busiestDay = Math.max(1, ...daily.map((day) => day.minutes));

  return (
    <Dialog open={open} title="Statistics" onClose={onClose} className="dialog--wide">
      {loading ? <p className="py-6 text-sm text-zinc-500">Loading your statistics…</p> : null}

      {error ? (
        <div className="banner flex-wrap items-center">
          <p className="banner__text">{error}</p>
          <Button size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : null}

      {!loading && !error && today && totals ? (
        <div className="space-y-6">
          <section aria-labelledby="stats-today">
            <h3 id="stats-today" className="mb-2 text-sm font-semibold text-zinc-800">
              Today
            </h3>
            <dl className="stat-grid">
              <StatBlock label="Focus sessions" value={String(today.sessions)} />
              <StatBlock label="Focus time" value={formatMinutes(today.focusMinutes)} />
              <StatBlock label="Tasks done" value={String(today.tasksCompleted)} />
            </dl>
          </section>

          <section aria-labelledby="stats-week">
            <h3 id="stats-week" className="mb-2 text-sm font-semibold text-zinc-800">
              Last 7 days
            </h3>

            {weekHasData ? (
              <ul className="week-chart">
                {daily.map((day) => {
                  const width = Math.round((day.minutes / busiestDay) * 100);

                  return (
                    <li key={day.date} className="week-row">
                      <span className="week-row__label">{weekdayLabel(day.date)}</span>
                      <span className="week-row__track">
                        <span
                          className="week-row__bar"
                          style={{ width: day.minutes > 0 ? `${Math.max(width, 4)}%` : "0%" }}
                        />
                      </span>
                      <span className="week-row__value">
                        {day.minutes}m
                        <span className="sr-only">
                          {" "}
                          on {day.date}, {day.sessions} sessions
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="No focus sessions in the last 7 days"
                hint="Finish a focus session and it will show up here."
              />
            )}
          </section>

          <section aria-labelledby="stats-all-time">
            <h3 id="stats-all-time" className="mb-2 text-sm font-semibold text-zinc-800">
              All time
            </h3>
            <dl className="stat-grid">
              <StatBlock label="Focus sessions" value={String(totals.sessions)} />
              <StatBlock label="Focus time" value={formatMinutes(totals.focusMinutes)} />
              <StatBlock
                label="Current streak"
                value={`${totals.streakDays} ${totals.streakDays === 1 ? "day" : "days"}`}
              />
            </dl>
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-block">
      <dt className="stat-block__label">{label}</dt>
      <dd className="stat-block__value">{value}</dd>
    </div>
  );
}
