import { chromium, type FullConfig } from "@playwright/test";

import { createDefaultMockState, installApiMock } from "./fixtures/apiMock";
import { STORAGE_STATE_PATH } from "./fixtures/auth";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:5173";

  const browser = await chromium.launch();
  const state = createDefaultMockState();
  const context = await browser.newContext();
  await context.addInitScript(
    ({ token }) => {
      window.localStorage.setItem("aimarketplace_access_token", token);
    },
    { token: state.accessToken },
  );
  const page = await context.newPage();
  await installApiMock(page, state);

  // Visit any app route once so the origin is recorded in storageState.
  await page.goto(String(baseURL) + "/login", { waitUntil: "domcontentloaded" });

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

