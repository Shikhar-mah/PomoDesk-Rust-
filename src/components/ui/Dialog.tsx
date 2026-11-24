// Accessible modal built on the native <dialog> element, so focus trapping,
// Escape handling and the backdrop come from the platform instead of hand-rolled
// JavaScript.
//
// Two extra rules are enforced here: the dialog is centred on the screen, and
// the page behind it cannot scroll while the dialog is open.

import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { CloseIcon } from "./Icon";

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

  // Open or close the platform dialog whenever the app asks for it.
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

      // Put the keyboard focus inside the dialog: on the control the form
      // marked as its starting point, or on the dialog itself otherwise.
      const startingPoint = element.querySelector<HTMLElement>("[data-autofocus]");
      (startingPoint ?? element).focus();
    } else if (element.open) {
      if (typeof element.close === "function") {
        element.close();
      } else {
        element.removeAttribute("open");
      }
    }
  }, [open]);

  // The page behind a modal must not scroll. The class is added to the body
  // so the whole document is held still, not just the dialog.
  useEffect(() => {
    if (!open) return;

    document.body.classList.add("is-dialog-open");
    return () => document.body.classList.remove("is-dialog-open");
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // Escape should close through our own state, not silently in the DOM.
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // The platform closed the dialog (Escape, or a native close). Keep the
        // React state in step so the dialog cannot be reopened by accident.
        if (open) onClose();
      }}
      onClick={(event) => {
        // Clicking the dimmed area (the dialog element itself) closes.
        if (event.target === ref.current) onClose();
      }}
      className={cn("dialog", className)}
    >
      <div className="dialog__inner">
        <header className="dialog__header">
          <div>
            <h2 id={titleId} className="dialog__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="dialog__description">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="dialog__close">
            <CloseIcon />
          </button>
        </header>

        <div className="dialog__body">{children}</div>

        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
