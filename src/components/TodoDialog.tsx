// Create/edit a To-do task: title, notes, due date/time, priority, list,
// reminder and a single-level checklist.

import { useEffect, useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { ReminderInput, Todo, TodoInput, TodoList, TodoPriority } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { TextAreaField } from "./ui/TextAreaField";
import { TextField } from "./ui/TextField";

type ReminderMode = "none" | "due" | "before" | "custom";

interface TodoDialogProps {
  open: boolean;
  todo: Todo | null;
  lists: TodoList[];
  defaultListId: number;
  onClose: () => void;
  onSave: (id: number | null, input: TodoInput) => Promise<void>;
  onDelete: (todo: Todo) => void;
  onAddSubtask: (todoId: number, title: string) => Promise<unknown>;
  onToggleSubtask: (id: number, done: boolean) => Promise<unknown>;
  onRemoveSubtask: (id: number) => Promise<unknown>;
}

const PRIORITIES: Array<{ value: TodoPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/** A stored UTC `fire_at` as the local value a datetime-local input wants. */
export function fireAtToLocalInput(fireAt: string): string {
  const date = new Date(fireAt.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function TodoDialog({
  open,
  todo,
  lists,
  defaultListId,
  onClose,
  onSave,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onRemoveSubtask,
}: TodoDialogProps) {
  const [title, setTitle] = useState(todo?.title ?? "");
  const [note, setNote] = useState(todo?.note ?? "");
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(todo?.dueTime ?? "");
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? "medium");
  const [listId, setListId] = useState(todo?.listId ?? defaultListId);
  const [reminderMode, setReminderMode] = useState<ReminderMode>(() => {
    if (!todo?.reminder) return "none";
    if (todo.reminder.kind === "due") return "due";
    if (todo.reminder.kind === "before") return "before";
    return "custom";
  });
  const [leadMinutes, setLeadMinutes] = useState(todo?.reminder?.leadMinutes ?? 10);
  const [customAt, setCustomAt] = useState(
    todo?.reminder?.kind === "custom" ? fireAtToLocalInput(todo.reminder.fireAt) : "",
  );
  const [newSubtask, setNewSubtask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The parent keys this dialog by task, but resetting on open keeps a
    // cancelled draft from leaking into a different task.
    if (!open) return;
    setTitle(todo?.title ?? "");
    setNote(todo?.note ?? "");
    setDueDate(todo?.dueDate ?? "");
    setDueTime(todo?.dueTime ?? "");
    setPriority(todo?.priority ?? "medium");
    setListId(todo?.listId ?? defaultListId);
    setError(null);
    // Deliberately keyed by id, not the whole object: a checklist mutation
    // reloads the store and must not wipe the fields being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, todo?.id, defaultListId]);

  function buildReminder(): ReminderInput | null {
    if (reminderMode === "none") return null;
    if (reminderMode === "due") return { mode: "due" };
    if (reminderMode === "before") return { mode: "before", leadMinutes };
    return { mode: "custom", at: customAt };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Give the task a title.");
      return;
    }
    if (reminderMode === "custom" && !customAt) {
      setError("Choose a reminder date and time.");
      return;
    }
    if ((reminderMode === "due" || reminderMode === "before") && !dueDate) {
      setError("Add a due date before setting a reminder for it.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave(todo?.id ?? null, {
        title: cleanTitle,
        note: note.trim(),
        listId,
        priority,
        dueDate: dueDate || null,
        dueTime: dueDate && dueTime ? dueTime : null,
        reminder: buildReminder(),
      });
      onClose();
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={todo ? "Edit To-do" : "New To-do"}
      onClose={onClose}
      className="dialog--wide"
      footer={
        <>
          {todo ? (
            <Button
              variant="danger"
              className="mr-auto"
              disabled={busy}
              onClick={() => onDelete(todo)}
            >
              Delete
            </Button>
          ) : null}
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="todo-form" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="todo-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <section className="dialog-section">
          <TextField
            id="todo-title"
            label="Title"
            value={title}
            onChange={(value) => {
              setTitle(value);
              setError(null);
            }}
            maxLength={200}
            autoFocus
          />

          <TextAreaField
            id="todo-note"
            label="Notes"
            optional
            value={note}
            onChange={setNote}
            rows={3}
            maxLength={4000}
          />
        </section>

        <section className="dialog-section">
          <h3 className="dialog-section__title">Scheduling</h3>

          <div className="dialog-grid">
            <label className="field">
              <span className="field__label">Due date</span>
              <input
                type="date"
                className="text-input"
                value={dueDate}
                onChange={(event) => {
                  setDueDate(event.target.value);
                  if (!event.target.value) setDueTime("");
                }}
              />
            </label>

            <label className="field">
              <span className="field__label">Due time</span>
              <input
                type="time"
                className="text-input"
                value={dueTime}
                disabled={!dueDate}
                onChange={(event) => setDueTime(event.target.value)}
              />
            </label>
          </div>

          <fieldset className="field">
            <legend className="field__label">Priority</legend>
            <div className="segmented" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  role="radio"
                  aria-checked={priority === entry.value}
                  className="segmented__button"
                  onClick={() => setPriority(entry.value)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span className="field__label">List</span>
            <select
              className="text-input"
              value={listId}
              onChange={(event) => setListId(Number(event.target.value))}
            >
              {lists
                .filter((list) => list.archivedAt === null)
                .map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Reminder</span>
            <select
              className="text-input"
              value={reminderMode}
              onChange={(event) => setReminderMode(event.target.value as ReminderMode)}
            >
              <option value="none">None</option>
              <option value="due">At due time</option>
              <option value="before">Before the due time</option>
              <option value="custom">Custom…</option>
            </select>
          </label>

          {reminderMode === "before" ? (
            <label className="field">
              <span className="field__label">Lead time</span>
              <select
                className="text-input"
                value={leadMinutes}
                onChange={(event) => setLeadMinutes(Number(event.target.value))}
              >
                <option value={10}>10 minutes before</option>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
              </select>
            </label>
          ) : null}

          {reminderMode === "custom" ? (
            <label className="field">
              <span className="field__label">Remind me at</span>
              <input
                type="datetime-local"
                className="text-input"
                value={customAt}
                onChange={(event) => setCustomAt(event.target.value)}
              />
            </label>
          ) : null}

          <p className="field__hint">
            Reminders arrive while PomoDesk is running. A date-only task is anchored at
            09:00.
          </p>
        </section>

        {todo ? (
          <section className="dialog-section">
            <h3 className="dialog-section__title">Checklist</h3>

            {todo.subtasks.length > 0 ? (
              <ul className="todo-checklist">
                {todo.subtasks.map((item) => (
                  <li key={item.id} className="todo-checklist__row">
                    <label className="todo-check-row">
                      <input
                        type="checkbox"
                        checked={item.isDone}
                        aria-label={
                          item.isDone ? `Re-open "${item.title}"` : `Mark "${item.title}" done`
                        }
                        onChange={(event) => void onToggleSubtask(item.id, event.target.checked)}
                      />
                      <span className={item.isDone ? "line-through text-zinc-400" : ""}>
                        {item.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-label={`Delete checklist item "${item.title}"`}
                      onClick={() => void onRemoveSubtask(item.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field__hint">No checklist items yet.</p>
            )}

            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const title = newSubtask.trim();
                if (!title) return;
                void onAddSubtask(todo.id, title).then(() => setNewSubtask(""));
              }}
            >
              <input
                type="text"
                className="text-input min-w-0 flex-1"
                aria-label="New checklist item"
                placeholder="Add a checklist item"
                value={newSubtask}
                maxLength={200}
                onChange={(event) => setNewSubtask(event.target.value)}
              />
              <Button type="submit" size="sm" disabled={!newSubtask.trim()}>
                Add
              </Button>
            </form>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="banner">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
