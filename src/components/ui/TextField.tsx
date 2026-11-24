// A single-line text field: label, control, hint and error.
//
// The `Field` wrapper adds the label, the hint and the error; this component
// only owns the control itself.

import { Field } from "./Field";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  maxLength?: number;
  /** Browser autofill hint, e.g. "off" for a free-text field. */
  autoComplete?: string;
  /** Move the keyboard focus here when the form opens. */
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  placeholder,
  maxLength,
  autoComplete,
  autoFocus,
  className,
  inputClassName,
}: TextFieldProps) {
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
        type="text"
        className={inputClassName ?? "text-input"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete ?? "off"}
        data-autofocus={autoFocus ? "" : undefined}
      />
    </Field>
  );
}
