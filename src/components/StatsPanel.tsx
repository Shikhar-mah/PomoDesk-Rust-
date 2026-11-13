// Statistics panel: today, the last seven days, and all-time figures.
// Data is fetched only while the panel is open.

import { useEffect } from "react";

import { formatMinutes, weekdayLabel } from "../lib/format";
import { useStatsStore } from "../stores/stats";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";

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
    <Dialog open={open} title="Statistics" onClose={onClose} className="w-[min(94vw,560px)]">
      {loading ? <p className="py-6 text-sm text-zinc-500">Loading your statistics…</p> : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!loading && !error && today && totals ? (
        <div className="space-y-6">
          <section aria-labelledby="stats-today">
            <h3 id="stats-today" className="mb-2 text-sm font-semibold text-zinc-800">
              Today
            </h3>
            <dl className="grid grid-cols-3 gap-2">
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
              <div className="flex h-36 items-end gap-2 rounded-lg border border-zinc-100 p-3">
                {daily.map((day) => {
                  const height = Math.round((day.minutes / busiestDay) * 100);
                  return (
                    <div key={day.date} className="flex h-full flex-1 flex-col items-center gap-1">
                      <div className="flex w-full flex-1 items-end" aria-hidden="true">
                        <div
                          className="w-full rounded-t bg-zinc-800"
                          style={{ height: day.minutes > 0 ? `${Math.max(height, 4)}%` : "2px" }}
                        />
                      </div>
                      <p className="text-[11px] tabular-nums text-zinc-600">
                        {weekdayLabel(day.date)}
                      </p>
                      <p
                        className="text-[11px] tabular-nums text-zinc-400"
                        aria-label={`${day.date}: ${day.sessions} sessions, ${day.minutes} minutes`}
                      >
                        {day.minutes}
                      </p>
                    </div>
                  );
                })}
              </div>
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
            <dl className="grid grid-cols-3 gap-2">
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
    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <dt className="text-[11px] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{value}</dd>
    </div>
  );
}
