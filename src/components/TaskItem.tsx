// One row in the task list. Purely presentational: every action is a prop, which
// keeps the component easy to test and reuse.

import { cn } from "../lib/cn";
import type { Task } from "../lib/types";
import { IconButton } from "./ui/Button";

interface TaskItemProps {
  task: Task;
  onActivate: (task: Task) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskItem({ task, onActivate, onToggleDone, onEdit, onDelete }: TaskItemProps) {
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", task.isDone && "bg-zinc-50/60")}>
      <button
        type="button"
        onClick={() => onActivate(task)}
        disabled={task.isDone}
        aria-pressed={task.isActive}
        aria-label={
          task.isDone
            ? `"${task.title}" is completed and cannot be the current task`
            : task.isActive
              ? `"${task.title}" is the current task`
              : `Make "${task.title}" the current task`
        }
        title={task.isDone ? "Completed tasks cannot be the current task" : "Make this the current task"}
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 transition-colors",
          task.isActive
            ? "border-zinc-900 bg-zinc-900"
            : "border-zinc-300 hover:border-zinc-500",
          task.isDone && "cursor-not-allowed opacity-50 hover:border-zinc-300",
        )}
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium text-zinc-800",
            task.isDone && "text-zinc-500 line-through",
          )}
        >
          {task.title}
          {task.isActive ? (
            <span className="ml-2 align-middle text-xs font-normal text-zinc-500">(current)</span>
          ) : null}
        </p>
        {task.note ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{task.note}</p>
        ) : null}
      </div>

      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
          task.completedSlots >= task.estSlots
            ? "bg-emerald-100 text-emerald-800"
            : "bg-zinc-100 text-zinc-600",
        )}
        aria-label={`${task.completedSlots} of ${task.estSlots} planned pomodoros done`}
        title={`${task.completedSlots} of ${task.estSlots} planned pomodoros done`}
      >
        {task.completedSlots}/{task.estSlots}
      </span>

      <div className="mt-0.5 flex shrink-0 items-center">
        <IconButton
          label={task.isDone ? `Re-open "${task.title}"` : `Mark "${task.title}" done`}
          onClick={() => onToggleDone(task, !task.isDone)}
          className={cn(task.isDone && "text-emerald-600 hover:text-emerald-700")}
        >
          {task.isDone ? "↺" : "✓"}
        </IconButton>
        <IconButton label={`Edit "${task.title}"`} onClick={() => onEdit(task)}>
          ✎
        </IconButton>
        <IconButton label={`Delete "${task.title}"`} onClick={() => onDelete(task)}>
          🗑
        </IconButton>
      </div>
    </li>
  );
}
