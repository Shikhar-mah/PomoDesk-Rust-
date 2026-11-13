// Quick-add form under the task list. Validation errors appear next to the
// fields, and the typed values are kept if the save fails.

import { useId, useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { TaskInput } from "../lib/types";
import { Button } from "./ui/Button";
import { InlineError } from "./ui/InlineError";

interface AddTaskFormProps {
  onAdd: (input: TaskInput) => Promise<void>;
}

export function AddTaskForm({ onAdd }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [slots, setSlots] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

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
      await onAdd({ title: cleanTitle, note: "", estSlots });
      setTitle("");
      setSlots("1");
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-zinc-100 px-4 py-3" noValidate>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="new-task-title" className="mb-1 block text-xs font-medium text-zinc-600">
            Task title
          </label>
          <input
            id="new-task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What are you working on?"
            maxLength={120}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          />
        </div>

        <div className="w-20 shrink-0">
          <label htmlFor="new-task-slots" className="mb-1 block text-xs font-medium text-zinc-600">
            Pomodoros
          </label>
          <input
            id="new-task-slots"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            step={1}
            value={slots}
            onChange={(event) => setSlots(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm tabular-nums outline-none focus:border-zinc-500"
          />
        </div>

        <Button type="submit" variant="primary" disabled={busy} className="mb-0.5">
          {busy ? "Adding…" : "Add task"}
        </Button>
      </div>

      <InlineError id={errorId} message={error} />
    </form>
  );
}
