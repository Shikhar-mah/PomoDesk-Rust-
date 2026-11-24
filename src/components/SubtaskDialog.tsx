import { useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { Subtask } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { NumberField } from "./ui/NumberField";
import { TextField } from "./ui/TextField";

interface SubtaskDialogProps {
  subtask: Subtask | null;
  onClose: () => void;
  onSave: (id: number, input: { title: string; estSlots: number; completedSlots: number }) => Promise<void>;
  onDelete?: (subtask: Subtask) => void;
}

type ErrorScope = "title" | "slots" | "done" | "save";

export function SubtaskDialog({ subtask, onClose, onSave, onDelete }: SubtaskDialogProps) {
  const [title, setTitle] = useState(subtask?.title ?? "");
  const [slots, setSlots] = useState(String(subtask?.estSlots ?? 1));
  const [done, setDone] = useState(String(subtask?.completedSlots ?? 0));
  const [error, setError] = useState<{ scope: ErrorScope; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subtask || busy) return;

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError({ scope: "title", message: "Give the subtask a title." });
      return;
    }

    const estSlots = Number(slots);
    if (!Number.isInteger(estSlots) || estSlots < 1 || estSlots > 99) {
      setError({ scope: "slots", message: "Planned pomodoros must be a whole number between 1 and 99." });
      return;
    }

    const completedSlots = Number(done);
    if (!Number.isInteger(completedSlots) || completedSlots < 0 || completedSlots > 999) {
      setError({ scope: "done", message: "Pomodoros done must be a whole number between 0 and 999." });
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onSave(subtask.id, { title: cleanTitle, estSlots, completedSlots });
      onClose();
    } catch (saveError) {
      setError({ scope: "save", message: describeError(saveError) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={subtask !== null}
      title="Edit subtask"
      onClose={onClose}
      footer={
        <>
          {onDelete && subtask ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                onDelete(subtask);
                onClose();
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-subtask-form" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-subtask-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          id="edit-subtask-title"
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

        <NumberField
          id="edit-subtask-slots"
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
          id="edit-subtask-done"
          label="Pomodoros done"
          value={done}
          onChange={(value) => {
            setDone(value);
            setError(null);
          }}
          min={0}
          max={999}
          step={1}
          hint="Correct this if a session was counted by mistake."
          error={error?.scope === "done" ? error.message : null}
          className="w-36"
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