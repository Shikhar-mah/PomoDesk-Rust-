// The task card: heading, list, empty state, error banner and the quick-add form.

import { useState } from "react";

import type { Subtask, Task, TaskInput } from "../lib/types";
import { AddTaskForm } from "./AddTaskForm";
import { TaskItem } from "./TaskItem";
import { EmptyState } from "./ui/EmptyState";

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  /** Set while a task action is running, so nothing is submitted twice. */
  busy?: boolean;
  onAdd: (input: TaskInput) => Promise<void>;
  onActivate: (task: Task) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAddSubtask: (task: Task, title: string, estSlots: number) => void;
  onToggleSubtaskDone: (subtask: Subtask, done: boolean) => void;
  onSelectSubtask: (subtask: Subtask) => void;
  onEditSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtask: Subtask) => void;
}

export function TaskList({
  tasks,
  loading,
  error,
  busy,
  onAdd,
  onActivate,
  onToggleDone,
  onEdit,
  onDelete,
  onAddSubtask,
  onToggleSubtaskDone,
  onSelectSubtask,
  onEditSubtask,
  onDeleteSubtask,
}: TaskListProps) {
  // Finished tasks are hidden by default so the list stays about what is left.
  const [showCompleted, setShowCompleted] = useState(false);

  const openTasks = tasks.filter((task) => !task.isDone).length;
  const completedTasks = tasks.length - openTasks;
  const visibleTasks = showCompleted ? tasks : tasks.filter((task) => !task.isDone);

  return (
    <section
      aria-labelledby="task-list-heading"
      className="surface-card overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-100 px-4 py-3">
        <h2 id="task-list-heading" className="text-sm font-semibold text-zinc-800">
          Tasks
        </h2>

        <div className="flex items-center gap-4">
          <p className="text-xs text-zinc-600">
            {openTasks === 0 ? "Nothing open" : `${openTasks} open`}
          </p>

          {completedTasks > 0 ? (
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-zinc-900"
                checked={showCompleted}
                onChange={(event) => setShowCompleted(event.target.checked)}
              />
              Show completed
            </label>
          ) : null}
        </div>
      </header>

      {error ? (
        <p role="alert" className="banner mx-4 my-3">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="px-4 py-6 text-sm text-zinc-500">Loading your tasks…</p>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          hint="Add what you're working on — every finished focus session counts towards it."
        />
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          title="Everything is done"
          hint="All of your tasks are finished. Turn on “Show completed” to see them again."
          action={
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-zinc-900"
                checked={showCompleted}
                onChange={(event) => setShowCompleted(event.target.checked)}
              />
              Show completed tasks
            </label>
          }
        />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {visibleTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              disabled={busy}
              onActivate={onActivate}
              onToggleDone={onToggleDone}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              onToggleSubtaskDone={onToggleSubtaskDone}
              onSelectSubtask={onSelectSubtask}
              onEditSubtask={onEditSubtask}
              onDeleteSubtask={onDeleteSubtask}
            />
          ))}
        </ul>
      )}

      <AddTaskForm onAdd={onAdd} />
    </section>
  );
}
