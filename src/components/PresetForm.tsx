// Create/edit form for a timer preset. Durations are entered in minutes and
// converted to seconds before they reach the core.

import { useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { Preset, PresetInput } from "../lib/types";
import { Button } from "./ui/Button";
import { NumberField } from "./ui/NumberField";
import { TextField } from "./ui/TextField";

interface PresetFormProps {
  preset: Preset | null;
  onCancel: () => void;
  onSubmit: (input: PresetInput) => Promise<void>;
}

/** The place a message belongs to, so it appears next to the right control. */
type ErrorScope = "name" | "focus" | "short" | "long" | "every" | "save";

const MINUTES_ERROR = "Each duration must be a whole number of minutes between 1 and 240.";

export function PresetForm({ preset, onCancel, onSubmit }: PresetFormProps) {
  const [name, setName] = useState(preset?.name ?? "");
  const [focus, setFocus] = useState(String(Math.round((preset?.focusSec ?? 1500) / 60)));
  const [shortBreak, setShortBreak] = useState(
    String(Math.round((preset?.shortBreakSec ?? 300) / 60)),
  );
  const [longBreak, setLongBreak] = useState(
    String(Math.round((preset?.longBreakSec ?? 900) / 60)),
  );
  const [every, setEvery] = useState(String(preset?.longBreakEvery ?? 4));
  const [error, setError] = useState<{ scope: ErrorScope; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const cleanName = name.trim();
    if (!cleanName) {
      setError({ scope: "name", message: "Give this preset a name." });
      return;
    }

    const focusMinutes = Number(focus);
    const shortMinutes = Number(shortBreak);
    const longMinutes = Number(longBreak);
    const everyCount = Number(every);

    const validMinutes = (value: number) =>
      Number.isInteger(value) && value >= 1 && value <= 240;

    if (!validMinutes(focusMinutes)) {
      setError({ scope: "focus", message: MINUTES_ERROR });
      return;
    }
    if (!validMinutes(shortMinutes)) {
      setError({ scope: "short", message: MINUTES_ERROR });
      return;
    }
    if (!validMinutes(longMinutes)) {
      setError({ scope: "long", message: MINUTES_ERROR });
      return;
    }
    if (!Number.isInteger(everyCount) || everyCount < 1 || everyCount > 12) {
      setError({
        scope: "every",
        message: "A long break can happen after 1 to 12 focus sessions.",
      });
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await onSubmit({
        name: cleanName,
        focusSec: focusMinutes * 60,
        shortBreakSec: shortMinutes * 60,
        longBreakSec: longMinutes * 60,
        longBreakEvery: everyCount,
      });
    } catch (submitError) {
      setError({ scope: "save", message: describeError(submitError) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <TextField
        id="preset-name"
        label="Name"
        value={name}
        onChange={(value) => {
          setName(value);
          setError(null);
        }}
        maxLength={40}
        placeholder="For example: Writing"
        error={error?.scope === "name" ? error.message : null}
        autoFocus
      />

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          id="preset-focus"
          label="Focus"
          value={focus}
          onChange={(value) => {
            setFocus(value);
            setError(null);
          }}
          min={1}
          max={240}
          step={1}
          error={error?.scope === "focus" ? error.message : null}
        />
        <NumberField
          id="preset-short"
          label="Short break"
          value={shortBreak}
          onChange={(value) => {
            setShortBreak(value);
            setError(null);
          }}
          min={1}
          max={240}
          step={1}
          error={error?.scope === "short" ? error.message : null}
        />
        <NumberField
          id="preset-long"
          label="Long break"
          value={longBreak}
          onChange={(value) => {
            setLongBreak(value);
            setError(null);
          }}
          min={1}
          max={240}
          step={1}
          error={error?.scope === "long" ? error.message : null}
        />
      </div>

      <p className="-mt-1 text-xs text-zinc-600">All durations are in minutes.</p>

      <NumberField
        id="preset-every"
        label="Long break every"
        value={every}
        onChange={(value) => {
          setEvery(value);
          setError(null);
        }}
        min={1}
        max={12}
        step={1}
        hint="focus sessions"
        error={error?.scope === "every" ? error.message : null}
        className="w-44"
      />

      {error?.scope === "save" ? (
        <p role="alert" className="banner">
          {error.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : preset ? "Save preset" : "Create preset"}
        </Button>
      </div>
    </form>
  );
}
