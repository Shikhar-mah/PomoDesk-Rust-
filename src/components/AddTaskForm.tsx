// Quick-add form under the task list. Validation errors appear next to the
// fields they belong to, and the typed values are kept if the save fails.

import { useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { TaskInput } from "../lib/types";
import { Button } from "./ui/Button";
import { NumberField } from "./ui/NumberField";
import { TextField } from "./ui/TextField";

interface AddTaskFormProps {
  onAdd: (input: TaskInput) => Promise<void>;
}

/** Which field a validation message belongs to. */
type FieldName = "title" | "slots";

export function AddTaskForm({ onAdd }: AddTaskFormProps) {
  const [title, setTitle] = useState("");
  const [slots, setSlots] = useState("1");
  const [tags, setTags] = useState("");
  const [fieldError, setFieldError] = useState<{ field: FieldName; message: string } | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFieldError({ field: "title", message: "Give the task a title." });
      setSaveError(null);
      return;
    }

    const estSlots = Number(slots);
    if (!Number.isInteger(estSlots) || estSlots < 1 || estSlots > 99) {
      setFieldError({
        field: "slots",
        message: "Planned pomodoros must be a whole number between 1 and 99.",
      });
      setSaveError(null);
      return;
    }

    setBusy(true);
    setFieldError(null);
    setSaveError(null);

    try {
      await onAdd({
        title: cleanTitle,
        note: "",
        estSlots,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setTitle("");
      setSlots("1");
      setTags("");
    } catch (submitError) {
      setSaveError(describeError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-zinc-100 px-4 py-3" noValidate>
      <div className="flex items-start gap-2">
        <TextField
          id="new-task-title"
          label="Task title"
          value={title}
          onChange={(value) => {
            setTitle(value);
            setFieldError(null);
            setSaveError(null);
          }}
          error={fieldError?.field === "title" ? fieldError.message : null}
          placeholder="What are you working on?"
          maxLength={120}
          className="min-w-0 flex-1"
        />

        <NumberField
          id="new-task-slots"
          label="Pomodoros"
          value={slots}
          onChange={(value) => {
            setSlots(value);
            setFieldError(null);
            setSaveError(null);
          }}
          min={1}
          max={99}
          step={1}
          optional
          error={fieldError?.field === "slots" ? fieldError.message : null}
          className="w-20 shrink-0"
        />

        <div className="form-row__submit">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Adding…" : "Add task"}
          </Button>
        </div>
      </div>

      <div className="mt-2">
        <TextField
          id="new-task-tags"
          label="Tags"
          value={tags}
          onChange={(value) => {
            setTags(value);
            setSaveError(null);
          }}
          placeholder="work, deep-focus"
          hint="Up to 5, separated by commas"
          className="w-full"
        />
      </div>

      {saveError ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {saveError}
        </p>
      ) : null}
    </form>
  );
}
