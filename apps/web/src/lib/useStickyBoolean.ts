import { useCallback, useEffect, useState } from "react";

/**
 * Boolean state persisted to `localStorage` under the given key.
 * Falls back to `defaultValue` when storage is empty or unavailable (SSR, private mode).
 */
export function useStickyBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "true") {
        return true;
      }
      if (raw === "false") {
        return false;
      }
    } catch {
      // ignore storage errors
    }
    return defaultValue;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(key, value ? "true" : "false");
    } catch {
      // ignore storage errors
    }
  }, [key, value]);

  const update = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setValue((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  return [value, update];
}
