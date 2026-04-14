import { chromium, type FullConfig } from "@playwright/test";

import { createDefaultMockState, installApiMock } from "./fixtures/apiMock";
import { setAccessTokenInStorage, STORAGE_STATE_PATH } from "./fixtures/auth";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:5173";

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const state = createDefaultMockState();
  await installApiMock(page, state);

  // Prime localStorage token then hit an authed page to ensure /api/auth/me resolves.
  await setAccessTokenInStorage(context, { token: state.accessToken, origin: String(baseURL) });
  await page.goto(String(baseURL) + "/");
  await page.waitForURL("**/");

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();
}

