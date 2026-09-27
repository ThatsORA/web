// Owner: Ojas — Shared busy-action helper for managing per-item busy state and error handling.
import { useCallback, useState } from "react";

export function useBusyAction() {
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const isBusy = useCallback((id: string) => !!busyMap[id], [busyMap]);

  const runAction = useCallback(async (id: string, actionFn: () => Promise<void>) => {
    setError(null);
    setBusyMap((prev) => ({ ...prev, [id]: true }));
    try {
      await actionFn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyMap((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  return {
    busyMap,
    isBusy,
    error,
    setError,
    runAction,
  };
}
