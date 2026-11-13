// Create/edit form for a timer preset. Durations are entered in minutes and
// converted to seconds before they reach the core.

import { useId, useState, type FormEvent } from "react";

import { describeError } from "../lib/ipc";
import type { Preset, PresetInput } from "../lib/types";
import { Button } from "./ui/Button";
import { InlineError } from "./ui/InlineError";

interface PresetFormProps {
  preset: Preset | null;
  onCancel: () => void;
  onSubmit: (input: PresetInput) => Promise<void>;
}

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const cleanName = name.trim();
    if (!cleanName) {
      setError("Give this preset a name.");
      return;
    }

    const focusMinutes = Number(focus);
    const shortMinutes = Number(shortBreak);
    const longMinutes = Number(longBreak);
    const everyCount = Number(every);

    const validMinutes = (value: number) =>
      Number.isInteger(value) && value >= 1 && value <= 240;

    if (!validMinutes(focusMinutes) || !validMinutes(shortMinutes) || !validMinutes(longMinutes)) {
      setError("Each duration must be a whole number of minutes between 1 and 240.");
      return;
    }
    if (!Number.isInteger(everyCount) || everyCount < 1 || everyCount > 12) {
      setError("A long break can happen after 1 to 12 focus sessions.");
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
      setError(describeError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div>
        <label htmlFor="preset-name" className="mb-1 block text-sm font-medium text-zinc-700">
          Name
        </label>
        <input
          id="preset-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberField id="preset-focus" label="Focus" value={focus} onChange={setFocus} />
        <NumberField
          id="preset-short"
          label="Short break"
          value={shortBreak}
          onChange={setShortBreak}
        />
        <NumberField
          id="preset-long"
          label="Long break"
          value={longBreak}
          onChange={setLongBreak}
        />
      </div>

      <div className="w-44">
        <NumberField
          id="preset-every"
          label="Long break every"
          value={every}
          onChange={setEvery}
          hint="focus sessions"
        />
      </div>

      <p className="text-xs text-zinc-500">Durations are in minutes.</p>

      <InlineError id={errorId} message={error} />

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

function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-600">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={240}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm tabular-nums outline-none focus:border-zinc-500"
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-[11px] text-zinc-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
