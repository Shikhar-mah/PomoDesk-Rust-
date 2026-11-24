// A numeric field: label, control, hint and error.
//
// The `Field` wrapper adds the label, the hint and the error; this component
// only owns the control itself.

import { Field } from "./Field";

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  /** Move the keyboard focus here when the form opens. */
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  optional,
  hint,
  error,
  autoFocus,
  className,
  inputClassName,
}: NumberFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      className={className}
    >
      <input
        type="number"
        inputMode="numeric"
        className={inputClassName ?? "number-input"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        step={step}
        data-autofocus={autoFocus ? "" : undefined}
      />
    </Field>
  );
}
