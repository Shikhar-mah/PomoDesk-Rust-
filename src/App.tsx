// The single screen of PomoDesk.
//
// It wires the stores to the presentational components and owns the dialogs.
// All timer decisions belong to Rust; this file only forwards choices.

import { useCallback, useEffect, useState } from "react";

import { ConfirmDialog } from "./components/ConfirmDialog";
import { EditTaskDialog } from "./components/EditTaskDialog";
import { Notice } from "./components/Notice";
import { PresetTabs } from "./components/PresetTabs";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatsPanel } from "./components/StatsPanel";
import { TaskList } from "./components/TaskList";
import { TimerCard } from "./components/TimerCard";
import { Button } from "./components/ui/Button";
import { bindCoreEvents } from "./lib/events";
import { IpcError } from "./lib/ipc";
import type { Task } from "./lib/types";
import { usePresetsStore } from "./stores/presets";
import { useSettingsStore } from "./stores/settings";
import { selectActiveTask, useTasksStore } from "./stores/tasks";
import { useTimerStore } from "./stores/timer";
import { useUiStore } from "./stores/ui";

export default function App() {
  const snapshot = useTimerStore((state) => state.snapshot);
  const timerLoading = useTimerStore((state) => state.loading);
  const timerError = useTimerStore((state) => state.error);

  const presets = usePresetsStore((state) => state.presets);
  const presetsError = usePresetsStore((state) => state.error);

  const tasks = useTasksStore((state) => state.tasks);
  const tasksLoading = useTasksStore((state) => state.loading);
  const tasksError = useTasksStore((state) => state.error);
  const addTask = useTasksStore((state) => state.add);

  const settingsError = useSettingsStore((state) => state.error);

  const [busy, setBusy] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<{ presetId: number; message: string } | null>(
    null,
  );

  // ---- Bootstrap ---------------------------------------------------------

  useEffect(() => {
    void usePresetsStore.getState().load();
    void useTasksStore.getState().load();
    void useTimerStore.getState().load();
    void useSettingsStore.getState().load();

    return bindCoreEvents();
  }, []);

  // ---- Actions -----------------------------------------------------------

  /** Runs an action, shows a friendly message if it fails, and tracks busy. */
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      useUiStore.getState().reportError(error);
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleTimer = useCallback(() => {
    const timer = useTimerStore.getState();
    const status = timer.snapshot?.status;

    return run(async () => {
      if (status === "running") await timer.pause();
      else if (status === "paused") await timer.resume();
      else await timer.start();
    });
  }, [run]);

  const resetTimer = useCallback(
    () => run(() => useTimerStore.getState().reset()),
    [run],
  );

  const skipTimer = useCallback(() => run(() => useTimerStore.getState().skip()), [run]);

  const selectPreset = useCallback(async (presetId: number) => {
    try {
      await useTimerStore.getState().switchPreset(presetId, false);
    } catch (error) {
      // Mid-focus, the core asks for confirmation instead of switching.
      if (error instanceof IpcError && error.code === "NEEDS_CONFIRMATION") {
        setPendingSwitch({ presetId, message: error.message });
        return;
      }
      useUiStore.getState().reportError(error);
    }
  }, []);

  async function confirmSwitch() {
    if (!pendingSwitch) return;
    const target = pendingSwitch;
    setPendingSwitch(null);
    await run(() => useTimerStore.getState().switchPreset(target.presetId, true));
  }

  async function confirmDeleteTask() {
    if (!deletingTask) return;
    const target = deletingTask;
    setDeletingTask(null);
    await run(() => useTasksStore.getState().remove(target.id));
  }

  // ---- Keyboard shortcuts ------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target?.isContentEditable === true;

      // Do not steal keys while typing or while a dialog is open.
      if (isTyping || document.querySelector("dialog[open]")) return;

      if (event.code === "Space") {
        event.preventDefault();
        void toggleTimer();
      } else if (event.key === "r" || event.key === "R") {
        void resetTimer();
      } else if (event.key === "s" || event.key === "S") {
        void skipTimer();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleTimer, resetTimer, skipTimer]);

  // ---- Render ------------------------------------------------------------

  const activePreset =
    presets.find((preset) => preset.id === snapshot?.activePresetId) ?? presets[0] ?? null;
  const activeTask = selectActiveTask(tasks);

  const loadError = timerError ?? presetsError ?? settingsError;

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">PomoDesk</h1>
          <div className="flex items-center gap-2">
            <Button onClick={() => setStatsOpen(true)}>Stats</Button>
            <Button onClick={() => setSettingsOpen(true)}>Settings</Button>
          </div>
        </header>

        {loadError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        ) : null}

        {presets.length > 0 ? (
          <PresetTabs
            presets={presets}
            activePresetId={snapshot?.activePresetId ?? presets[0].id}
            disabled={busy || !snapshot}
            onSelect={(presetId) => void selectPreset(presetId)}
          />
        ) : null}

        {snapshot && activePreset ? (
          <TimerCard
            snapshot={snapshot}
            longBreakEvery={activePreset.longBreakEvery}
            busy={busy}
            onToggle={() => void toggleTimer()}
            onReset={() => void resetTimer()}
            onSkip={() => void skipTimer()}
          />
        ) : (
          <div className="rounded-2xl bg-zinc-200 px-6 py-16 text-center text-sm text-zinc-600">
            {timerLoading ? "Starting PomoDesk…" : "The timer is unavailable right now."}
          </div>
        )}

        <p className="px-1 text-sm text-zinc-600">
          Current:{" "}
          {activeTask ? (
            <span className="font-medium text-zinc-900">{activeTask.title}</span>
          ) : (
            <span className="text-zinc-400">
              no task selected — pick one below to count your pomodoros
            </span>
          )}
        </p>

        <TaskList
          tasks={tasks}
          loading={tasksLoading}
          error={tasksError}
          onAdd={addTask}
          onActivate={(task) => void run(() => useTasksStore.getState().activate(task.id))}
          onToggleDone={(task, done) =>
            void run(() => useTasksStore.getState().toggleDone(task.id, done))
          }
          onEdit={(task) => setEditingTask(task)}
          onDelete={(task) => setDeletingTask(task)}
        />

        <p className="pb-2 text-center text-xs text-zinc-400">
          Space starts or pauses · R restarts the session · S skips ahead
        </p>
      </div>

      <EditTaskDialog
        key={editingTask?.id ?? "none"}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={(id, input) => useTasksStore.getState().edit(id, input)}
      />

      <ConfirmDialog
        open={deletingTask !== null}
        title="Delete task?"
        message={
          deletingTask
            ? `“${deletingTask.title}” will be removed. Pomodoros you already completed still count in your statistics.`
            : ""
        }
        confirmLabel="Delete task"
        destructive
        onConfirm={() => void confirmDeleteTask()}
        onCancel={() => setDeletingTask(null)}
      />

      <ConfirmDialog
        open={pendingSwitch !== null}
        title="Switch preset?"
        message={pendingSwitch?.message ?? ""}
        confirmLabel="Switch preset"
        onConfirm={() => void confirmSwitch()}
        onCancel={() => setPendingSwitch(null)}
      />

      <StatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Notice />
    </div>
  );
}
