// Shown when a list is genuinely empty (not when it failed to load).

interface EmptyStateProps {
  title: string;
  hint?: string;
}

export function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
    </div>
  );
}
