import { test, expect } from "@playwright/test";

import { createDefaultMockState, installApiMock } from "./fixtures/apiMock";

test.beforeEach(async ({ page }) => {
  const state = createDefaultMockState();
  await installApiMock(page, state);
});

test("sidebar navigation works", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Primary").getByRole("link", { name: "Chat" }).click();
  await expect(page).toHaveURL(/\/chat$/);

  await page.getByLabel("Primary").getByRole("link", { name: "Marketplace" }).click();
  await expect(page).toHaveURL(/\/marketplace$/);
});

test("marketplace can install a skill and deep-link to chat", async ({ page }) => {
  const state = createDefaultMockState();
  // Fresh state per test so install mutates predictably.
  await installApiMock(page, state);

  await page.goto("/marketplace");

  await expect(page.getByText("Your installed skills")).toBeVisible();
  await expect(page.getByText("Meeting notes")).toBeVisible();

  // Install the catalog skill.
  await page
    .getByText("Meeting notes")
    .locator("..")
    .locator("..")
    .getByRole("button", { name: "Install" })
    .click();

  // Installed section should now contain two items.
  await expect(page.getByRole("list").first()).toContainText("Summarize docs");
  await expect(page.getByRole("list").first()).toContainText("Meeting notes");

  // Start chat on an installed skill.
  await page.getByRole("link", { name: "Start Chat" }).first().click();
  await expect(page).toHaveURL(/\/chat\?skill_id=/);
});

test("chat can send a message and display assistant reply", async ({ page }) => {
  await page.goto("/chat");

  await expect(page.getByText("Conversation")).toBeVisible();

  await page.getByPlaceholder("Ask something about your uploaded documents…").fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Hello", { exact: true })).toBeVisible();
  await expect(page.getByText("Echo: Hello")).toBeVisible();
});

test("documents upload flow completes (presign → PUT → ingest)", async ({ page }) => {
  await page.goto("/documents");

  const fileChooser = page.locator("input[type=file]");
  await fileChooser.setInputFiles({
    name: "uploaded.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });

  await page.getByRole("button", { name: "Upload & index" }).click();

  await expect(page.getByText(/Ready —/)).toBeVisible();
});

