// Shared button so every action looks and behaves the same.
//
// `variant` says what the action does (primary, secondary, ghost, danger) and
// `size` says how much room it takes. Anything else about a button should be
// decided by the component that uses it, not by re-styling this one.

import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn--primary",
  secondary: "btn--secondary",
  ghost: "btn--ghost",
  danger: "btn--danger",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "btn--sm",
  md: "",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cn("btn", VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The name screen readers announce; also used as the tooltip. */
  label: string;
  /** `danger` tints the icon red for destructive actions. */
  tone?: "default" | "danger";
}

/** Square, icon-only button. `label` is announced by screen readers. */
export function IconButton({
  label,
  tone = "default",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "icon-btn",
        tone === "danger" && "icon-btn--danger",
        className,
      )}
    />
  );
}
