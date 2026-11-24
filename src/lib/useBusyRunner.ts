// Runs an action, shows a friendly message if it fails, and reports whether the
// action is still in flight.
//
// Each caller keeps its own instance, so a slow task action never blocks the
// timer controls (and the other way round).

import { useCallback, useState } from "react";

import { useUiStore } from "../stores/ui";

export function useBusyRunner() {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      useUiStore.getState().reportError(error);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
