// Edit dialog for an existing task (title, optional note, planned pomodoros).

import { useId, useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { Task, TaskInput } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { InlineError } from "./ui/InlineError";

interface EditTaskDialogProps {
  task: Task | null;
  onClose: () => void;
  onSave: (id: number, input: TaskInput) => Promise<void>;
}

export function EditTaskDialog({ task, onClose, onSave }: EditTaskDialogProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [slots, setSlots] = useState(String(task?.estSlots ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || busy) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Give the task a title.");
      return;
    }

    const estSlots = Number(slots);
    if (!Number.isInteger(estSlots) || estSlots < 1 || estSlots > 99) {
      setError("Planned pomodoros must be a whole number between 1 and 99.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onSave(task.id, { title: cleanTitle, note: note.trim(), estSlots });
      onClose();
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={task !== null}
      title="Edit task"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-task-form" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-task-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="edit-task-title" className="mb-1 block text-sm font-medium text-zinc-700">
            Title
          </label>
          <input
            id="edit-task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <div>
          <label htmlFor="edit-task-note" className="mb-1 block text-sm font-medium text-zinc-700">
            Note <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <textarea
            id="edit-task-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <div className="w-36">
          <label htmlFor="edit-task-slots" className="mb-1 block text-sm font-medium text-zinc-700">
            Planned pomodoros
          </label>
          <input
            id="edit-task-slots"
            type="number"
            min={1}
            max={99}
            step={1}
            value={slots}
            onChange={(event) => setSlots(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm tabular-nums outline-none focus:border-zinc-500"
          />
        </div>

        <InlineError id={errorId} message={error} />
      </form>
    </Dialog>
  );
}
