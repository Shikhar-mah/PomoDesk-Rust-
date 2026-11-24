// A labelled form control.
//
// The control is the only child of `Field`. Field copies the `id`, the
// `aria-describedby` link to the hint and the error, and `aria-invalid` onto
// it, so every form in the app describes its fields in exactly the same way
// and a screen reader always hears the label, the hint and the error together.

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { cn } from "../../lib/cn";

interface FieldProps {
  /** The id of the control the field wraps. The label points at it. */
  id: string;
  label: string;
  /** Marks the field as not required, for the user's benefit. */
  optional?: boolean;
  /** Extra explanation shown under the control. */
  hint?: string;
  /** The problem with this field, shown under the control and announced. */
  error?: string | null;
  className?: string;
  children: ReactNode;
}

export function Field({
  id,
  label,
  optional,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;

  // The error comes first so it is read out before the softer hint.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children as unknown as ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={cn("field", className)}>
      <div className="field__label-row">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        {optional ? <span className="field__optional">optional</span> : null}
      </div>

      {control}

      {errorId ? (
        <p id={errorId} role="alert" className="field__error">
          {error}
        </p>
      ) : null}

      {hintId ? <p id={hintId} className="field__hint">{hint}</p> : null}
    </div>
  );
}
