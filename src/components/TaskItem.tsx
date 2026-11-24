// One row in the task list. Purely presentational: every action is a prop, which
// keeps the component easy to test and reuse.
//
// The row is laid out in two lines so it stays readable on a narrow window:
// the title and the progress on the first line, the note and the actions on
// the second.

import { useState } from "react";

import { cn } from "../lib/cn";
import type { Subtask, Task } from "../lib/types";
import { Button, IconButton } from "./ui/Button";
import { NumberField } from "./ui/NumberField";
import { TextField } from "./ui/TextField";
import { CheckIcon, EditIcon, TrashIcon, UndoIcon } from "./ui/Icon";

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
  const fullyPlanned = task.completedSlots >= task.estSlots;

  return (
    <li
      className={cn(
        "task-item",
        task.isActive && "task-item--current",
        task.isDone && "task-item--done",
      )}
    >
      <div className="flex items-start gap-3">
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
            {task.tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <span
          className={cn(
            "badge",
            fullyPlanned ? "badge--complete" : "badge--neutral",
          )}
          aria-label={`${task.completedSlots} of ${task.estSlots} planned pomodoros done`}
          title={`${task.completedSlots} of ${task.estSlots} planned pomodoros done`}
        >
          {task.completedSlots}/{task.estSlots}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2 pl-8">
        {task.note ? <p className="task-item__note line-clamp-2 min-w-0 flex-1">{task.note}</p> : null}

        <div className="ml-auto flex shrink-0 items-center">
          <IconButton
            label={task.isDone ? `Re-open "${task.title}"` : `Mark "${task.title}" done`}
            disabled={disabled}
            onClick={() => onToggleDone(task, !task.isDone)}
          >
            {task.isDone ? <UndoIcon /> : <CheckIcon />}
          </IconButton>
          <IconButton label={`Edit "${task.title}"`} disabled={disabled} onClick={() => onEdit(task)}>
            <EditIcon />
          </IconButton>
          <IconButton
            label={`Delete "${task.title}"`}
            tone="danger"
            disabled={disabled}
            onClick={() => onDelete(task)}
          >
            <TrashIcon />
          </IconButton>
        </div>
      </div>

      {task.subtasks.length > 0 || !task.isDone ? (
        <div className="mt-2 pl-8">
          <button
            type="button"
            className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {task.subtasks.length === 0
              ? "Add subtask"
              : `${task.subtasks.filter((s) => s.isDone).length}/${task.subtasks.length} subtasks`}
            {expanded ? " ▾" : " ▸"}
          </button>

          {expanded ? (
            <div className="mt-2 space-y-2">
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
                    <span className={cn("flex-1", subtask.isDone && "line-through text-zinc-400")}>
                      {subtask.title}
                    </span>
                    <span className="badge badge--neutral">
                      {subtask.completedSlots}/{subtask.estSlots}
                    </span>
                    <IconButton
                      label={subtask.isDone ? "Re-open subtask" : "Mark subtask done"}
                      disabled={disabled}
                      onClick={() => onToggleSubtaskDone(subtask, !subtask.isDone)}
                    >
                      {subtask.isDone ? <UndoIcon /> : <CheckIcon />}
                    </IconButton>
                    <IconButton
                      label="Edit subtask"
                      disabled={disabled}
                      onClick={() => onEditSubtask(subtask)}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      label="Delete subtask"
                      tone="danger"
                      disabled={disabled}
                      onClick={() => onDeleteSubtask(subtask)}
                    >
                      <TrashIcon />
                    </IconButton>
                  </li>
                ))}
              </ul>

              {!task.isDone ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = newSubtaskTitle.trim();
                    if (!title) return;
                    const slots = Number(newSubtaskSlots);
                    if (!Number.isInteger(slots) || slots < 1 || slots > 99) return;
                    onAddSubtask(task, title, slots);
                    setNewSubtaskTitle("");
                    setNewSubtaskSlots("1");
                  }}
                >
                  <TextField
                    id={`new-subtask-${task.id}`}
                    label="Subtask title"
                    value={newSubtaskTitle}
                    onChange={setNewSubtaskTitle}
                    placeholder="Add a subtask"
                    maxLength={120}
                    className="min-w-0 flex-1"
                  />
                  <NumberField
                    id={`new-subtask-slots-${task.id}`}
                    label="Pomodoros"
                    value={newSubtaskSlots}
                    onChange={setNewSubtaskSlots}
                    min={1}
                    max={99}
                    step={1}
                    className="w-16 shrink-0"
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={disabled}>
                    Add
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
