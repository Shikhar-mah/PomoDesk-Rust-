// Shared button so every action looks and behaves the same.

import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-800 disabled:hover:bg-zinc-900",
  secondary:
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
  ghost: "text-zinc-600 hover:bg-zinc-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

/** Square, icon-only button. `label` is announced by screen readers. */
export function IconButton({
  label,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-base",
        "text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    />
  );
}
