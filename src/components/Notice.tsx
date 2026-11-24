// A single, non-blocking message at the bottom of the screen. Errors stay a bit
// longer than confirmations, and both can be dismissed.

import { useEffect } from "react";

import { cn } from "../lib/cn";
import { useUiStore } from "../stores/ui";
import { AlertIcon, CheckCircleIcon, CloseIcon } from "./ui/Icon";

export function Notice() {
  const notice = useUiStore((state) => state.notice);
  const clearNotice = useUiStore((state) => state.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearNotice, notice.kind === "error" ? 7000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [notice, clearNotice]);

  if (!notice) return null;

  const isError = notice.kind === "error";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        role={isError ? "alert" : "status"}
        className={cn(
          "notice pointer-events-auto max-w-[520px]",
          isError ? "notice--error" : "notice--success",
        )}
      >
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          {isError ? <AlertIcon /> : <CheckCircleIcon />}
        </span>
        <p className="min-w-0 flex-1">{notice.text}</p>
        <button
          type="button"
          onClick={clearNotice}
          aria-label="Dismiss message"
          className="notice__dismiss"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
