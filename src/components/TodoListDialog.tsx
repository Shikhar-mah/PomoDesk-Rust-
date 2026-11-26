// Create or rename a To-do list, with a fixed set of colour and icon tokens.

import { useEffect, useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { TodoList, TodoListInput } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import {
  BookIcon,
  BriefcaseIcon,
  HeartIcon,
  InboxIcon,
  ListIcon,
  UserIcon,
} from "./ui/Icon";
import { TextField } from "./ui/TextField";

interface TodoListDialogProps {
  open: boolean;
  list: TodoList | null;
  onClose: () => void;
  onSave: (id: number | null, input: TodoListInput) => Promise<void>;
}

const COLORS = ["zinc", "blue", "green", "amber", "rose", "violet"] as const;
const ICONS = [
  { value: "list", label: "List", Glyph: ListIcon },
  { value: "inbox", label: "Inbox", Glyph: InboxIcon },
  { value: "briefcase", label: "Briefcase", Glyph: BriefcaseIcon },
  { value: "user", label: "Person", Glyph: UserIcon },
  { value: "book", label: "Book", Glyph: BookIcon },
  { value: "heart", label: "Heart", Glyph: HeartIcon },
] as const;

export function TodoListDialog({ open, list, onClose, onSave }: TodoListDialogProps) {
  const [name, setName] = useState(list?.name ?? "");
  const [color, setColor] = useState(list?.color ?? "zinc");
  const [icon, setIcon] = useState(list?.icon ?? "list");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(list?.name ?? "");
    setColor(list?.color ?? "zinc");
    setIcon(list?.icon ?? "list");
    setError(null);
  }, [open, list]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean || busy) {
      if (!clean) setError("Give the list a name.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSave(list?.id ?? null, { name: clean, color, icon });
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
      title={list ? "Edit list" : "New list"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="todo-list-form" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="todo-list-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          id="todo-list-name"
          label="Name"
          value={name}
          onChange={(value) => {
            setName(value);
            setError(null);
          }}
          maxLength={60}
          autoFocus
        />

        <fieldset className="field">
          <legend className="field__label">Colour</legend>
          <div className="swatches">
            {COLORS.map((entry) => (
              <button
                key={entry}
                type="button"
                className="swatch"
                data-color={entry}
                aria-label={entry}
                aria-pressed={color === entry}
                onClick={() => setColor(entry)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field__label">Icon</legend>
          <div className="icon-choices">
            {ICONS.map(({ value, label, Glyph }) => (
              <button
                key={value}
                type="button"
                className="icon-choice"
                aria-label={label}
                aria-pressed={icon === value}
                onClick={() => setIcon(value)}
              >
                <Glyph />
              </button>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="banner">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
