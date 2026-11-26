// Edit dialog for a Pomodoro task, organised into Basics / Focus plan /
// Organisation. The dialog body is the only scroll region.

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
        message: "Planned pomodoros must be between 1 and 99.",
      });
      return;
    }

    const completedSlots = Number(done);
    if (!Number.isInteger(completedSlots) || completedSlots < 0 || completedSlots > 999) {
      setError({
        scope: "done",
        message: "Pomodoros done must be between 0 and 999.",
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
          .map((part) => part.trim())
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
      className="dialog--wide"
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
      <form id="edit-task-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <section aria-labelledby="edit-task-basics" className="dialog-section">
          <h3 id="edit-task-basics" className="dialog-section__title">
            Basics
          </h3>

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
            rows={2}
            maxLength={2000}
            placeholder="Anything you want to remember"
          />
        </section>

        <section aria-labelledby="edit-task-plan" className="dialog-section">
          <h3 id="edit-task-plan" className="dialog-section__title">
            Focus plan
          </h3>

          <div className="dialog-grid">
            <NumberField
              id="edit-task-slots"
              label="Planned"
              value={slots}
              onChange={(value) => {
                setSlots(value);
                setError(null);
              }}
              min={1}
              max={99}
              step={1}
              error={error?.scope === "slots" ? error.message : null}
            />

            <NumberField
              id="edit-task-done"
              label="Completed"
              value={done}
              onChange={(value) => {
                setDone(value);
                setError(null);
              }}
              min={0}
              max={999}
              step={1}
              hint="Doesn't change statistics."
              error={error?.scope === "done" ? error.message : null}
            />
          </div>
        </section>

        <section aria-labelledby="edit-task-organisation" className="dialog-section">
          <h3 id="edit-task-organisation" className="dialog-section__title">
            Organisation
          </h3>

          <TextField
            id="edit-task-tags"
            label="Tags"
            optional
            value={tags}
            onChange={(value) => {
              setTags(value);
              setError(null);
            }}
            placeholder="work, deep-focus"
            hint="Up to 5, separated by commas"
          />
        </section>

        {error?.scope === "save" ? (
          <p role="alert" className="banner">
            {error.message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
