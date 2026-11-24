// Shown when a list is genuinely empty (not when it failed to load).
//
// The optional `action` gives the user the next step, so an empty list is
// never a dead end.

import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
