// The task card: heading, list, empty state, error banner and the quick-add form.

import type { Task, TaskInput } from "../lib/types";
import { AddTaskForm } from "./AddTaskForm";
import { TaskItem } from "./TaskItem";
import { EmptyState } from "./ui/EmptyState";

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onAdd: (input: TaskInput) => Promise<void>;
  onActivate: (task: Task) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskList({
  tasks,
  loading,
  error,
  onAdd,
  onActivate,
  onToggleDone,
  onEdit,
  onDelete,
}: TaskListProps) {
  const openTasks = tasks.filter((task) => !task.isDone).length;

  return (
    <section
      aria-labelledby="task-list-heading"
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
    >
      <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h2 id="task-list-heading" className="text-sm font-semibold text-zinc-800">
          Tasks
        </h2>
        <p className="text-xs text-zinc-500">
          {openTasks === 0 ? "Nothing open" : `${openTasks} open`}
        </p>
      </header>

      {error ? (
        <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
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
      ) : (
        <ul className="divide-y divide-zinc-100">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onActivate={onActivate}
              onToggleDone={onToggleDone}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <AddTaskForm onAdd={onAdd} />
    </section>
  );
}
