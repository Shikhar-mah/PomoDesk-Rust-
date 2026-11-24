// A multi-line text field: label, control, hint and error.
//
// The `Field` wrapper adds the label, the hint and the error; this component
// only owns the control itself.

import { Field } from "./Field";

interface TextAreaFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  /** Move the keyboard focus here when the form opens. */
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  placeholder,
  maxLength,
  rows,
  autoFocus,
  className,
  inputClassName,
}: TextAreaFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      className={className}
    >
      <textarea
        className={inputClassName ?? "text-area"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        data-autofocus={autoFocus ? "" : undefined}
      />
    </Field>
  );
}
