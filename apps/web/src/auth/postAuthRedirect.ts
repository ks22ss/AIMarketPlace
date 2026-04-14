/** After login or register, send the user back to a safe in-app path when present. */
export function postAuthDestination(locationState: unknown): string {
  const from = (locationState as { from?: string } | null)?.from;
  if (
    typeof from === "string" &&
    from.length > 0 &&
    from !== "/login" &&
    from !== "/register"
  ) {
    return from;
  }
  return "/";
}
