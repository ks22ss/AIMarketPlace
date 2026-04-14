import type { BrowserContext } from "@playwright/test";

export const STORAGE_STATE_PATH = "tests/.auth/storageState.json";
const ACCESS_TOKEN_STORAGE_KEY = "aimarketplace_access_token";

export async function setAccessTokenInStorage(
  context: BrowserContext,
  options: { token: string; origin?: string },
): Promise<void> {
  const origin = options.origin ?? "http://localhost:5173";
  const page = await context.newPage();
  await page.goto(origin + "/login", { waitUntil: "domcontentloaded" });
  await page.evaluate((token) => {
    window.localStorage.setItem("aimarketplace_access_token", token);
  }, options.token);
  await page.close();
}

