// Collapsed quick-add at the bottom of the Pomodoro task list.
//
// The permanent three-field form was one of the main sources of clutter. It now
// starts as a single `＋ Add task` row; optional fields live behind "More".

import { useRef, useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { TaskInput } from "../lib/types";
import { CloseIcon } from "./ui/Icon";

interface AddTaskFormProps {
  onAdd: (input: TaskInput) => Promise<void>;
}

type FieldName = "title" | "slots";

export function AddTaskForm({ onAdd }: AddTaskFormProps) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [title, setTitle] = useState("");
  const [slots, setSlots] = useState("1");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [fieldError, setFieldError] = useState<{ field: FieldName; message: string } | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  function reset() {
    setOpen(false);
    setMore(false);
    setTitle("");
    setSlots("1");
    setNote("");
    setTags("");
    setFieldError(null);
    setSaveError(null);
  }

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
        note: note.trim(),
        estSlots,
        tags: tags
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      });
      // Keep the row open and focused for rapid entry.
      setTitle("");
      setNote("");
      setTags("");
      setSlots("1");
      titleRef.current?.focus();
    } catch (submitError) {
      setSaveError(describeError(submitError));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="border-t border-zinc-100 px-2 py-1.5">
        <button
          type="button"
          className="task-add-row"
          onClick={() => {
            setOpen(true);
            window.setTimeout(() => titleRef.current?.focus(), 0);
          }}
        >
          <span aria-hidden="true">＋</span> Add task
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 border-t border-zinc-100 px-3 py-3"
      noValidate
      onKeyDown={(event) => {
        if (event.key === "Escape") reset();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          ref={titleRef}
          type="text"
          className="text-input min-w-0 flex-1"
          aria-label="Task title"
          placeholder="What are you working on?"
          value={title}
          maxLength={120}
          aria-invalid={fieldError?.field === "title" ? true : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setFieldError(null);
            setSaveError(null);
          }}
        />

        <input
          type="number"
          className="number-input w-20 shrink-0"
          aria-label="Pomodoros"
          min={1}
          max={99}
          step={1}
          value={slots}
          aria-invalid={fieldError?.field === "slots" ? true : undefined}
          onChange={(event) => {
            setSlots(event.target.value);
            setFieldError(null);
            setSaveError(null);
          }}
        />

        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </button>

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
        >
          More {more ? "▴" : "▾"}
        </button>

        <button
          type="button"
          className="icon-btn"
          aria-label="Close quick add"
          title="Close quick add"
          onClick={reset}
        >
          <CloseIcon />
        </button>
      </div>

      {fieldError ? (
        <p role="alert" className="field__error">
          {fieldError.message}
        </p>
      ) : null}

      {more ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            className="text-input"
            aria-label="Note"
            placeholder="Note (optional)"
            value={note}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
          />
          <input
            type="text"
            className="text-input"
            aria-label="Tags"
            placeholder="Tags: work, deep-focus"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>
      ) : null}

      {saveError ? (
        <p role="alert" className="banner">
          {saveError}
        </p>
      ) : null}
    </form>
  );
}
