// Accessible modal built on the native <dialog> element, so focus trapping,
// Escape handling and the backdrop come from the platform instead of hand-rolled
// JavaScript.

import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "../../lib/cn";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (open) {
      if (!element.open) {
        // jsdom and very old webviews may not implement showModal().
        if (typeof element.showModal === "function") {
          element.showModal();
        } else {
          element.setAttribute("open", "");
        }
      }
    } else if (element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape should close through our own state, not silently in the DOM.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Clicking the dimmed area (the dialog element itself) closes.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "w-[min(92vw,520px)] rounded-xl border border-zinc-200 bg-white p-0",
        "text-zinc-900 shadow-xl",
        className,
      )}
    >
      <div className="flex max-h-[85vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-zinc-600">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
