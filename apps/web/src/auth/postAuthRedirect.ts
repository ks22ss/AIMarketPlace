const MAX_RETURN_PATH_LEN = 2048;

/** Same-origin style path + optional query only (no protocol / scheme-relative URLs). */
function isSafeAppReturnPath(from: string): boolean {
  if (from.length === 0 || from.length > MAX_RETURN_PATH_LEN) {
    return false;
  }
  if (!from.startsWith("/")) {
    return false;
  }
  if (from.startsWith("//")) {
    return false;
  }
  if (from.includes("://") || from.includes("\\")) {
    return false;
  }
  const q = from.indexOf("?");
  const pathOnly = q === -1 ? from : from.slice(0, q);
  if (pathOnly.includes("//")) {
    return false;
  }
  return true;
}

/** After login or register, send the user back to a safe in-app path when present. */
export function postAuthDestination(locationState: unknown): string {
  const from = (locationState as { from?: string } | null)?.from;
  if (
    typeof from === "string" &&
    isSafeAppReturnPath(from) &&
    from !== "/login" &&
    from !== "/register"
  ) {
    return from;
  }
  return "/";
}
