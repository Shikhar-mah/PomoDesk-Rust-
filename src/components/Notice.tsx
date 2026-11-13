// A single, non-blocking message at the bottom of the screen. Errors stay a bit
// longer than confirmations, and both can be dismissed.

import { useEffect } from "react";

import { cn } from "../lib/cn";
import { useUiStore } from "../stores/ui";

export function Notice() {
  const notice = useUiStore((state) => state.notice);
  const clearNotice = useUiStore((state) => state.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearNotice, notice.kind === "error" ? 7000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [notice, clearNotice]);

  if (!notice) return null;

  return (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-[520px] items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg",
          notice.kind === "error" ? "bg-red-700 text-white" : "bg-zinc-900 text-white",
        )}
      >
        <p className="min-w-0">{notice.text}</p>
        <button
          type="button"
          onClick={clearNotice}
          aria-label="Dismiss message"
          className="shrink-0 rounded px-1 text-white/70 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
