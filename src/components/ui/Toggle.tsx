// A labelled on/off switch. Uses role="switch" so the state is announced, and
// never relies on colour alone (the knob position and aria-checked say it too).

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, checked, disabled, onChange }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-800">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full",
          "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-zinc-900" : "bg-zinc-300",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
