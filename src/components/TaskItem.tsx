// One compact row in the Pomodoro task list.
//
// Single line by default: selection, title, tags, progress, completion checkbox
// and one `⋯` menu. Subtasks and optional metadata stay behind a disclosure so
// the card does not grow nine controls tall.

import { useRef, useState } from "react";

import { cn } from "../lib/cn";
import type { Subtask, Task } from "../lib/types";
import { Menu } from "./ui/Menu";

interface TaskItemProps {
  task: Task;
  /** Set while another task action is still running. */
  disabled?: boolean;
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

export function TaskItem({
  task,
  disabled,
  onActivate,
  onToggleDone,
  onEdit,
  onDelete,
  onAddSubtask,
  onToggleSubtaskDone,
  onSelectSubtask,
  onEditSubtask,
  onDeleteSubtask,
}: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskSlots, setNewSubtaskSlots] = useState("1");
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const doneSubtasks = task.subtasks.filter((subtask) => subtask.isDone).length;
  const progress = Math.min(100, Math.round((task.completedSlots / task.estSlots) * 100));
  const visibleTags = task.tags.slice(0, 2);
  const extraTags = task.tags.length - visibleTags.length;

  function revealSubtaskForm() {
    setExpanded(true);
    // The form is one render away; focus after it exists.
    window.setTimeout(() => subtaskInputRef.current?.focus(), 0);
  }

  const menuItems = [
    { label: "Edit", onSelect: () => onEdit(task), disabled: task.isDone },
    { label: "Add subtask", onSelect: revealSubtaskForm, disabled: task.isDone },
    {
      label: task.isDone ? "Re-open" : "Mark complete",
      onSelect: () => onToggleDone(task, !task.isDone),
    },
    { label: "Delete", onSelect: () => onDelete(task), danger: true },
  ];

  return (
    <li
      className={cn(
        "task-item",
        task.isActive && "task-item--current",
        task.isDone && "task-item--done",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onActivate(task)}
          disabled={task.isDone || disabled}
          aria-pressed={task.isActive}
          aria-label={
            task.isDone
              ? `"${task.title}" is completed and cannot be the current task`
              : task.isActive
                ? `"${task.title}" is the current task`
                : `Make "${task.title}" the current task`
          }
          title={
            task.isDone
              ? "Completed tasks cannot be the current task"
              : "Make this the current task"
          }
          className="task-select"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="task-item__title break-words">{task.title}</p>
            {task.isActive ? <span className="badge badge--current">Current</span> : null}
          </div>

          {task.tags.length > 0 || task.note || task.subtasks.length > 0 || !task.isDone ? (
            <div className="task-item__meta">
              {visibleTags.map((tag) => (
                <span key={tag} className="tag-chip">
                  {tag}
                </span>
              ))}
              {extraTags > 0 ? <span className="tag-chip">+{extraTags}</span> : null}

              {task.subtasks.length > 0 || !task.isDone ? (
                <button
                  type="button"
                  className="task-item__disclosure"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {task.subtasks.length === 0
                    ? "Add subtask"
                    : `${doneSubtasks}/${task.subtasks.length} subtasks`}
                  <span aria-hidden="true">{expanded ? " ▾" : " ▸"}</span>
                </button>
              ) : null}

              {task.note ? (
                <span className="task-item__note-preview" title={task.note}>
                  {task.note}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span
            className="task-item__progress"
            aria-label={`${task.completedSlots} of ${task.estSlots} planned pomodoros done`}
            title={`${task.completedSlots} of ${task.estSlots} planned pomodoros done`}
          >
            {task.completedSlots}/{task.estSlots}
          </span>

          <label className="task-check">
            <input
              type="checkbox"
              checked={task.isDone}
              disabled={disabled}
              aria-label={
                task.isDone ? `Re-open "${task.title}"` : `Mark "${task.title}" done`
              }
              onChange={(event) => onToggleDone(task, event.target.checked)}
            />
          </label>

          <Menu label={`More actions for "${task.title}"`} items={menuItems} disabled={disabled} />
        </div>
      </div>

      <div className="task-item__bar" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      {expanded ? (
        <div className="task-item__subtasks">
          <ul className="space-y-1">
            {task.subtasks.map((subtask) => (
              <li key={subtask.id} className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => onSelectSubtask(subtask)}
                  disabled={subtask.isDone || disabled}
                  aria-pressed={subtask.isActive}
                  aria-label={`Make "${subtask.title}" the current subtask`}
                  className="task-select task-select--small"
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    subtask.isDone && "text-zinc-400 line-through",
                  )}
                >
                  {subtask.title}
                </span>
                <span
                  className="badge badge--neutral"
                  aria-label={`${subtask.completedSlots} of ${subtask.estSlots} planned pomodoros done`}
                >
                  {subtask.completedSlots}/{subtask.estSlots}
                </span>
                <Menu
                  label={`More actions for subtask "${subtask.title}"`}
                  items={[
                    {
                      label: "Edit",
                      onSelect: () => onEditSubtask(subtask),
                      disabled: subtask.isDone,
                    },
                    {
                      label: subtask.isDone ? "Re-open" : "Mark complete",
                      onSelect: () => onToggleSubtaskDone(subtask, !subtask.isDone),
                    },
                    {
                      label: "Delete",
                      onSelect: () => onDeleteSubtask(subtask),
                      danger: true,
                    },
                  ]}
                  disabled={disabled}
                />
              </li>
            ))}
          </ul>

          {!task.isDone ? (
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const title = newSubtaskTitle.trim();
                if (!title) return;
                const slots = Number(newSubtaskSlots);
                if (!Number.isInteger(slots) || slots < 1 || slots > 99) return;
                onAddSubtask(task, title, slots);
                setNewSubtaskTitle("");
                setNewSubtaskSlots("1");
                subtaskInputRef.current?.focus();
              }}
            >
              <input
                ref={subtaskInputRef}
                type="text"
                className="text-input min-w-0 flex-1"
                aria-label="Subtask title"
                placeholder="Add a subtask"
                value={newSubtaskTitle}
                maxLength={120}
                onChange={(event) => setNewSubtaskTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setExpanded(false);
                }}
              />
              <input
                type="number"
                className="number-input w-16 shrink-0"
                aria-label="Subtask pomodoros"
                min={1}
                max={99}
                step={1}
                value={newSubtaskSlots}
                onChange={(event) => setNewSubtaskSlots(event.target.value)}
              />
              <button type="submit" className="btn btn--primary btn--sm" disabled={disabled}>
                Add
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
