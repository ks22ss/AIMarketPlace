/** Lowercase snake_case identifiers for composable nodes. */
const NODE_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export function isValidNodeName(name: string): boolean {
  return NODE_NAME_PATTERN.test(name);
}
