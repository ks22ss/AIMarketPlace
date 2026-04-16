import { test, expect } from "@playwright/test";

import { createDefaultMockState, installApiMock } from "./fixtures/apiMock";

test.beforeEach(async ({ page }) => {
  const state = createDefaultMockState();
  await page.addInitScript(({ token }) => {
    window.localStorage.setItem("aimarketplace_access_token", token);
  }, { token: state.accessToken });
  await installApiMock(page, state);
});

test("sidebar navigation works", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Primary").getByRole("link", { name: "Chat" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByLabel("Primary").getByRole("link", { name: "Marketplace" }).click();
  await expect(page).toHaveURL(/\/marketplace$/);
});

test("marketplace can install a skill and deep-link to chat", async ({ page }) => {
  await page.goto("/marketplace");

  await expect(page.getByText("Your installed skills")).toBeVisible();
  await expect(page.getByText("Meeting notes", { exact: true })).toBeVisible();

  // Install the catalog skill.
  await page.getByRole("button", { name: "Install", exact: true }).click();

  // Installed section should now contain two items.
  await expect(page.getByRole("list").first()).toContainText("Summarize docs");
  await expect(page.getByRole("list").first()).toContainText("Meeting notes");

  // Start chat on an installed skill.
  await page.getByRole("link", { name: "Start Chat" }).first().click();
  await expect(page).toHaveURL(/\/\?skill_id=/);
});

test("chat can send a message and display assistant reply", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "New chat" })).toBeVisible();

  await page.getByPlaceholder("Message...").fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Hello", { exact: true })).toBeVisible();
  await expect(page.getByText("Echo: Hello")).toBeVisible();
  // After reply, the conversation is persisted and shows in the right sidebar.
  await expect(
    page.getByLabel("Chat history").getByText("Echo: Hello"),
  ).toBeVisible();
});

test("chat collapses <think> reasoning and keeps it togglable", async ({ page }) => {
  // Intercept chat to return a reply containing a think block.
  await page.route("**/api/chat", async (route) => {
    const reply = "<think>internal reasoning chain</think>Final answer: 42";
    const body =
      `event: meta\ndata: ${JSON.stringify({ trace_id: "trace_t" })}\n\n` +
      `event: token\ndata: ${JSON.stringify({ delta: reply })}\n\n` +
      `event: conversation\ndata: ${JSON.stringify({ conversation_id: "conv_think", title: "Final answer: 42" })}\n\n` +
      `event: done\ndata: ${JSON.stringify({ reply, conversation_id: "conv_think", title: "Final answer: 42" })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
      body,
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("Message...").fill("What is 6x7?");
  await page.getByRole("button", { name: "Send" }).click();

  // Visible content shows after </think>; full reasoning stays in the collapsible panel until expanded.
  await expect(page.getByText("Final answer: 42")).toBeVisible();
  const reasoningToggle = page.getByRole("button", { name: /^Reasoning/ });
  await expect(reasoningToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("reasoning-expanded-body")).toHaveCount(0);

  await reasoningToggle.click();
  await expect(reasoningToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("reasoning-expanded-body")).toContainText("internal reasoning chain");
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

