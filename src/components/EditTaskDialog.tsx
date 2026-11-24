// Edit dialog for an existing task (title, optional note, planned pomodoros).

import { useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { Task, TaskInput } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { NumberField } from "./ui/NumberField";
import { TextAreaField } from "./ui/TextAreaField";
import { TextField } from "./ui/TextField";

interface EditTaskDialogProps {
  task: Task | null;
  onClose: () => void;
  onSave: (id: number, input: TaskInput) => Promise<void>;
}

/** The place a message belongs to, so it appears next to the right control. */
type ErrorScope = "title" | "slots" | "done" | "save";

export function EditTaskDialog({ task, onClose, onSave }: EditTaskDialogProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [slots, setSlots] = useState(String(task?.estSlots ?? 1));
  const [done, setDone] = useState(String(task?.completedSlots ?? 0));
  const [tags, setTags] = useState((task?.tags ?? []).join(", "));
  const [error, setError] = useState<{ scope: ErrorScope; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || busy) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError({ scope: "title", message: "Give the task a title." });
      return;
    }

    const estSlots = Number(slots);
    if (!Number.isInteger(estSlots) || estSlots < 1 || estSlots > 99) {
      setError({
        scope: "slots",
        message: "Planned pomodoros must be a whole number between 1 and 99.",
      });
      return;
    }

    const completedSlots = Number(done);
    if (!Number.isInteger(completedSlots) || completedSlots < 0 || completedSlots > 999) {
      setError({
        scope: "done",
        message: "Pomodoros done must be a whole number between 0 and 999.",
      });
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onSave(task.id, {
        title: cleanTitle,
        note: note.trim(),
        estSlots,
        completedSlots,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (saveError) {
      setError({ scope: "save", message: describeError(saveError) });
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
        <TextField
          id="edit-task-title"
          label="Title"
          value={title}
          onChange={(value) => {
            setTitle(value);
            setError(null);
          }}
          maxLength={120}
          error={error?.scope === "title" ? error.message : null}
          autoFocus
        />

        <TextAreaField
          id="edit-task-note"
          label="Note"
          optional
          value={note}
          onChange={setNote}
          rows={3}
          maxLength={2000}
          placeholder="Anything you want to remember about this task"
        />

        <NumberField
          id="edit-task-slots"
          label="Planned pomodoros"
          value={slots}
          onChange={(value) => {
            setSlots(value);
            setError(null);
          }}
          min={1}
          max={99}
          step={1}
          hint="How many focus sessions you expect this to take"
          error={error?.scope === "slots" ? error.message : null}
          className="w-36"
        />

        <NumberField
          id="edit-task-done"
          label="Pomodoros done"
          value={done}
          onChange={(value) => {
            setDone(value);
            setError(null);
          }}
          min={0}
          max={999}
          step={1}
          hint="Correct this if a session was counted by mistake. Your statistics won't change."
          error={error?.scope === "done" ? error.message : null}
          className="w-36"
        />

        <TextField
          id="edit-task-tags"
          label="Tags"
          value={tags}
          onChange={(value) => {
            setTags(value);
            setError(null);
          }}
          placeholder="work, deep-focus"
          hint="Up to 5, separated by commas"
        />

        {error?.scope === "save" ? (
          <p role="alert" className="banner">
            {error.message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
