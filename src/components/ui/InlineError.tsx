// Inline error text. Announced immediately by screen readers, and always paired
// with an explanation the user can act on.

interface InlineErrorProps {
  message: string | null;
  id?: string;
}

export function InlineError({ message, id }: InlineErrorProps) {
  if (!message) return null;

  return (
    <p id={id} role="alert" className="mt-2 text-sm text-red-700">
      {message}
    </p>
  );
}
