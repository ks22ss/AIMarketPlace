/**
 * Builds an absolute or same-origin URL for API calls.
 * - When `VITE_API_URL` is unset/empty: returns `path` (leading slash) so Vite dev/preview proxy can forward `/api/*`.
 * - When set (e.g. static hosting + separate API): returns `${base}${path}`.
 */
export function resolveApiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_URL?.trim();
  const base = raw?.replace(/\/+$/, "") ?? "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
