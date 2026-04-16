import { defineConfig } from "vitest/config";

/**
 * Root-level vitest runner. Each workspace has its own config inside `apps/*`,
 * but when vitest is invoked from the repo root it needs to skip Playwright
 * specs under `tests/` and still pick up unit tests in both workspaces.
 */
export default defineConfig({
  test: {
    include: ["apps/**/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/**"],
  },
});
