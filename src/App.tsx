// The application shell.
//
// The timer markup stays here (it works and preserves muscle memory); the To-do
// module is a self-contained page. Navigation is a small store, not a router.

import { useCallback, useEffect, useRef, useState } from "react";

import { AppSidebar } from "./components/AppSidebar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { EditTaskDialog } from "./components/EditTaskDialog";
import { Notice } from "./components/Notice";
import { PresetTabs } from "./components/PresetTabs";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatsPanel } from "./components/StatsPanel";
import { SubtaskDialog } from "./components/SubtaskDialog";
import { TaskList } from "./components/TaskList";
import { TimerCard } from "./components/TimerCard";
import { TodoListDialog } from "./components/TodoListDialog";
import { TodoPage } from "./components/TodoPage";
import { Button } from "./components/ui/Button";
import { MenuIcon } from "./components/ui/Icon";
import { bindCoreEvents } from "./lib/events";
import { IpcError } from "./lib/ipc";
import { stopCompletionSound } from "./lib/sound";
import type { Subtask, Task, TodoList } from "./lib/types";
import { useBusyRunner } from "./lib/useBusyRunner";
import { useNavigationStore } from "./stores/navigation";
import { usePresetsStore } from "./stores/presets";
import { useSettingsStore } from "./stores/settings";
import { selectActiveTask, useTasksStore } from "./stores/tasks";
import { useTimerStore } from "./stores/timer";
import { useTodoStore } from "./stores/todos";

export default function App() {
  const snapshot = useTimerStore((state) => state.snapshot);
  const timerLoading = useTimerStore((state) => state.loading);
  const timerError = useTimerStore((state) => state.error);

  const presets = usePresetsStore((state) => state.presets);
  const presetsError = usePresetsStore((state) => state.error);

  const tasks = useTasksStore((state) => state.tasks);
  const tasksLoading = useTasksStore((state) => state.loading);
  const tasksError = useTasksStore((state) => state.error);

  const settingsError = useSettingsStore((state) => state.error);

  const section = useNavigationStore((state) => state.section);
  const sidebarOpen = useNavigationStore((state) => state.sidebarOpen);
  const setSidebarOpen = useNavigationStore((state) => state.setSidebarOpen);

  const timerAction = useBusyRunner();
  const taskAction = useBusyRunner();

  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingSubtask, setEditingSubtask] = useState<Subtask | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [listDialog, setListDialog] = useState<{ open: boolean; list: TodoList | null }>({
    open: false,
    list: null,
  });
  const [revealTodoId, setRevealTodoId] = useState<number | null>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const previousSidebarOpen = useRef(sidebarOpen);
  const [pendingSwitch, setPendingSwitch] = useState<
    | { kind: "preset"; presetId: number; message: string }
    | { kind: "mode"; mode: "focus" | "short_break" | "long_break"; message: string }
    | null
  >(null);

  // ---- Bootstrap ---------------------------------------------------------

  useEffect(() => {
    void usePresetsStore.getState().load();
    void useTasksStore.getState().load();
    void useTimerStore.getState().load();
    void useSettingsStore.getState().load();
    // The sidebar shows To-do lists while the timer is on screen, so load them
    // up front. A To-do failure must never block the timer.
    void useTodoStore.getState().load();

    return bindCoreEvents({
      onRevealTodo: (todoId) => {
        useNavigationStore.getState().setSection("todos");
        setRevealTodoId(todoId);
      },
    });
  }, []);

  /** Re-reads everything the core owns, after a failure the user can retry. */
  const reload = useCallback(() => {
    void usePresetsStore.getState().load();
    void useTasksStore.getState().load();
    void useTimerStore.getState().load();
    void useSettingsStore.getState().load();
    void useTodoStore.getState().load();
  }, []);

  // ---- Actions -----------------------------------------------------------

  const toggleTimer = useCallback(() => {
    stopCompletionSound();

    const timer = useTimerStore.getState();
    const status = timer.snapshot?.status;

    return timerAction.run(async () => {
      if (status === "running") await timer.pause();
      else if (status === "paused") await timer.resume();
      else await timer.start();
    });
  }, [timerAction]);

  const resetTimer = useCallback(
    () => {
      stopCompletionSound();
      return timerAction.run(() => useTimerStore.getState().reset());
    },
    [timerAction],
  );

  const skipTimer = useCallback(
    () => {
      stopCompletionSound();
      return timerAction.run(() => useTimerStore.getState().skip());
    },
    [timerAction],
  );

  const endTimer = useCallback(
    () => {
      stopCompletionSound();
      return timerAction.run(() => useTimerStore.getState().end());
    },
    [timerAction],
  );

  const selectPreset = useCallback(
    async (presetId: number) => {
      stopCompletionSound();
      await timerAction.run(async () => {
        try {
          await useTimerStore.getState().switchPreset(presetId, false);
        } catch (error) {
          if (error instanceof IpcError && error.code === "NEEDS_CONFIRMATION") {
            setPendingSwitch({ kind: "preset", presetId, message: error.message });
            return;
          }
          throw error;
        }
      });
    },
    [timerAction],
  );

  const selectMode = useCallback(
    async (mode: "focus" | "short_break" | "long_break") => {
      stopCompletionSound();
      await timerAction.run(async () => {
        try {
          await useTimerStore.getState().switchSessionType(mode, false);
        } catch (error) {
          if (error instanceof IpcError && error.code === "NEEDS_CONFIRMATION") {
            setPendingSwitch({ kind: "mode", mode, message: error.message });
            return;
          }
          throw error;
        }
      });
    },
    [timerAction],
  );

  async function confirmSwitch() {
    if (!pendingSwitch) return;
    stopCompletionSound();
    const target = pendingSwitch;
    setPendingSwitch(null);
    if (target.kind === "preset") {
      await timerAction.run(() => useTimerStore.getState().switchPreset(target.presetId, true));
    } else {
      await timerAction.run(() => useTimerStore.getState().switchSessionType(target.mode, true));
    }
  }

  async function confirmDeleteTask() {
    if (!deletingTask) return;
    const target = deletingTask;
    setDeletingTask(null);
    await taskAction.run(() => useTasksStore.getState().remove(target.id));
  }

  async function clearActiveTask() {
    await taskAction.run(() => useTasksStore.getState().activate(null));
  }

  async function saveList(id: number | null, input: { name: string; color: string; icon: string }) {
    if (id === null) await useTodoStore.getState().createList(input);
    else await useTodoStore.getState().updateList(id, input);
  }

  // Closing the drawer returns focus to the button that opened it.
  useEffect(() => {
    if (previousSidebarOpen.current && !sidebarOpen) {
      navToggleRef.current?.focus();
    }
    previousSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  // ---- Keyboard shortcuts ------------------------------------------------

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Timer shortcuts belong to the Timer section; they must not reset the
      // timer while the user is reading To-do tasks.
      if (section !== "timer") return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      const control = (event.target as HTMLElement | null)?.closest(
        "input, textarea, select, button, a, [contenteditable]",
      ) as HTMLElement | null;

      const tag = control?.tagName;
      const inputType = (control as HTMLInputElement | null)?.type;

      const isTyping =
        control?.isContentEditable === true ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (tag === "INPUT" &&
          inputType !== "checkbox" &&
          inputType !== "radio" &&
          inputType !== "button" &&
          inputType !== "submit" &&
          inputType !== "reset");

      if (isTyping || document.querySelector("dialog[open]")) return;

      const controlUsesSpace =
        tag === "BUTTON" ||
        tag === "A" ||
        (tag === "INPUT" && (inputType === "checkbox" || inputType === "radio"));

      if (event.code === "Space") {
        if (controlUsesSpace) return;
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
  }, [section, toggleTimer, resetTimer, skipTimer]);

  // ---- Render ------------------------------------------------------------

  const activePreset =
    presets.find((preset) => preset.id === snapshot?.activePresetId) ?? presets[0] ?? null;
  const activeTask = selectActiveTask(tasks);

  const loadError = timerError ?? presetsError ?? settingsError;
  const sectionTitle = section === "timer" ? "Timer" : "To-do";

  return (
    <div className="app-shell">
      <div className="app-topbar">
        <button
          ref={navToggleRef}
          type="button"
          className="icon-btn"
          aria-label="Open navigation"
          title="Open navigation"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          <MenuIcon />
        </button>
        <span className="app-topbar__title">{sectionTitle}</span>
      </div>

      <AppSidebar
        onOpenStats={() => setStatsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNewList={() => setListDialog({ open: true, list: null })}
        onEditList={(list) => setListDialog({ open: true, list })}
      />

      <main className="app-main">
        {section === "timer" ? (
          <div className="timer-page">
            <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
              <header className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-semibold tracking-tight text-zinc-900">PomoDesk</h1>
              </header>

              {loadError ? (
                <div role="alert" className="banner">
                  <p className="banner__text">{loadError}</p>
                  <Button size="sm" onClick={reload}>
                    Try again
                  </Button>
                </div>
              ) : null}

              {presets.length > 0 ? (
                <PresetTabs
                  presets={presets}
                  activePresetId={snapshot?.activePresetId ?? presets[0].id}
                  disabled={timerAction.busy || !snapshot}
                  onSelect={(presetId) => void selectPreset(presetId)}
                />
              ) : null}

              {snapshot && activePreset ? (
                <TimerCard
                  snapshot={snapshot}
                  longBreakEvery={activePreset.longBreakEvery}
                  busy={timerAction.busy}
                  onToggle={() => void toggleTimer()}
                  onReset={() => void resetTimer()}
                  onSkip={() => void skipTimer()}
                  onEnd={() => void endTimer()}
                  onSelectMode={(mode) => void selectMode(mode)}
                />
              ) : (
                <div className="rounded-2xl bg-zinc-200 px-6 py-16 text-center text-sm text-zinc-600">
                  {timerLoading ? "Starting PomoDesk…" : "The timer is unavailable right now."}
                </div>
              )}

              <section
                aria-labelledby="current-task-heading"
                className="surface-card flex items-center gap-3 px-3 py-2.5"
              >
                <span aria-hidden="true" className="shrink-0 text-zinc-500">
                  <TargetDot />
                </span>

                <div className="min-w-0 flex-1">
                  <h2 id="current-task-heading" className="text-xs font-medium text-zinc-600">
                    Working on
                  </h2>
                  {activeTask ? (
                    <p className="truncate text-sm font-medium text-zinc-900">{activeTask.title}</p>
                  ) : (
                    <p className="text-sm text-zinc-600">
                      No task — this focus time won't be counted against anything. Pick one below to
                      start counting.
                    </p>
                  )}
                </div>

                {activeTask ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Run sessions without counting them against a task"
                    title="Run sessions without counting them against a task"
                    disabled={taskAction.busy}
                    onClick={() => void clearActiveTask()}
                  >
                    No task
                  </Button>
                ) : (
                  <span
                    className="badge badge--neutral"
                    title="This session won't be counted against a task"
                  >
                    Orphan session
                  </span>
                )}
              </section>

              <TaskList
                tasks={tasks}
                loading={tasksLoading}
                error={tasksError}
                busy={taskAction.busy}
                onAdd={(input) => taskAction.run(() => useTasksStore.getState().add(input))}
                onActivate={(task) =>
                  void taskAction.run(() => useTasksStore.getState().activate(task.id))
                }
                onToggleDone={(task, done) =>
                  void taskAction.run(() => useTasksStore.getState().toggleDone(task.id, done))
                }
                onEdit={(task) => setEditingTask(task)}
                onDelete={(task) => setDeletingTask(task)}
                onAddSubtask={(task, title, estSlots) =>
                  taskAction.run(() => useTasksStore.getState().addSubtask(task.id, title, estSlots))
                }
                onToggleSubtaskDone={(subtask, done) =>
                  taskAction.run(() => useTasksStore.getState().toggleSubtaskDone(subtask.id, done))
                }
                onSelectSubtask={(subtask) =>
                  taskAction.run(() => useTasksStore.getState().activateSubtask(subtask.id))
                }
                onEditSubtask={(subtask) => setEditingSubtask(subtask)}
                onDeleteSubtask={(subtask) =>
                  taskAction.run(() => useTasksStore.getState().removeSubtask(subtask.id))
                }
              />

              <p className="pb-2 text-center text-xs text-zinc-600">
                <kbd className="kbd">Space</kbd> start or pause · <kbd className="kbd">R</kbd>{" "}
                restart · <kbd className="kbd">S</kbd> skip
              </p>
            </div>
          </div>
        ) : (
          <TodoPage
            onNewList={() => setListDialog({ open: true, list: null })}
            onEditList={(list) => setListDialog({ open: true, list })}
            revealTodoId={revealTodoId}
            onRevealHandled={() => setRevealTodoId(null)}
          />
        )}
      </main>

      <EditTaskDialog
        key={editingTask ? `task-${editingTask.id}` : "task-closed"}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={(id, input) => useTasksStore.getState().edit(id, input)}
      />

      <SubtaskDialog
        key={editingSubtask ? `subtask-${editingSubtask.id}` : "subtask-closed"}
        subtask={editingSubtask}
        onClose={() => setEditingSubtask(null)}
        onSave={(id, input) => useTasksStore.getState().editSubtask(id, input)}
        onDelete={(subtask) => {
          void taskAction.run(() => useTasksStore.getState().removeSubtask(subtask.id));
        }}
      />

      <TodoListDialog
        key={listDialog.list ? `list-${listDialog.list.id}` : "list-new"}
        open={listDialog.open}
        list={listDialog.list}
        onClose={() => setListDialog({ open: false, list: null })}
        onSave={saveList}
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
        title={pendingSwitch?.kind === "mode" ? "Switch session?" : "Switch preset?"}
        message={pendingSwitch?.message ?? ""}
        confirmLabel={pendingSwitch?.kind === "mode" ? "Switch session" : "Switch preset"}
        onConfirm={() => void confirmSwitch()}
        onCancel={() => setPendingSwitch(null)}
      />

      <StatsPanel open={statsOpen} onClose={() => setStatsOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Notice />
    </div>
  );
}

/** The "Working on" icon, kept local so the shell does not import a full page. */
function TargetDot() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
