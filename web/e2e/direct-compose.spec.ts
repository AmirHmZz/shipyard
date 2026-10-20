import type { Locator, Page } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

async function fillCompose(editor: Locator, yaml: string) {
  await editor.focus();
  await editor.press("ControlOrMeta+a");
  await editor.press("Backspace");
  await editor.evaluate((node, text) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", text);
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, yaml);
}
const composeLines = (page: Page) =>
  page.getByTestId("compose-code-editor").locator(".view-lines");

const initialYAML = "services:\n  web:\n    image: nginx:alpine\n";
async function setup(page: Page, existing = false, canWrite = true) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let document = { yaml: initialYAML, version: 1 };
  let conflict = false;
  let reads = 0;
  const resource = (id: string, kind: string, parentId = "", data = {}) => ({
    id,
    kind,
    parentId,
    name: id,
    data,
    version: 1,
    secretKeys: [],
    canWrite,
    teamId: "team",
  });
  const app = resource("app", "application", "environment", {
    source: "compose",
    engine: "compose",
    serverId: "server",
    context: ".",
    file: "compose.yaml",
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: { id: "operator", name: "Operator", admin: true },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources")) {
      if (request.method() === "POST") {
        writes.push({ path, body: request.postDataJSON() });
        existing = true;
        return route.fulfill({ json: app });
      }
      return route.fulfill({
        json: [
          resource("team", "team"),
          resource("project", "project", "team"),
          resource("environment", "environment", "project"),
          resource("server", "server"),
          ...(existing ? [{ ...app, version: document.version }] : []),
        ],
      });
    }
    if (path.endsWith("/compose")) {
      if (request.method() === "GET") {
        reads++;
        return route.fulfill({ json: document });
      }
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (conflict)
        return route.fulfill({
          status: 409,
          json: { error: "Application changed; reload before saving" },
        });
      document = { yaml: body.yaml, version: document.version + 1 };
      return route.fulfill({ json: document });
    }
    if (path === "/api/v1/resources/app" && request.method() === "PUT") {
      const body = request.postDataJSON();
      writes.push({ path, body });
      Object.assign(app, { name: body.name, data: body.data });
      return route.fulfill({ json: app });
    }
    if (path.endsWith("/deploy")) {
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: { id: "deployment" } });
    }
    if (path.endsWith("/runtime"))
      return route.fulfill({ json: { status: "stopped" } });
    if (path.endsWith("/events"))
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path.startsWith("/api/v1/deployments/"))
      return route.fulfill({
        json: {
          id: path.split("/").at(-1),
          applicationId: "app",
          state: "healthy",
        },
      });
    if (
      path.endsWith("/metrics") ||
      path.endsWith("/releases") ||
      path.endsWith("/deployments")
    )
      return route.fulfill({ json: [] });
    throw new Error(`Unexpected API ${request.method()} ${path}`);
  });
  return {
    writes,
    conflict: (value: boolean) => {
      conflict = value;
    },
    reads: () => reads,
  };
}

test("editing application settings preserves Compose and links to its dedicated editor", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page.goto("/configure/application/app?return=/applications/app");
  await expect(
    page.getByRole("heading", { name: "Edit application" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Compose YAML", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Loading saved Compose document…", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open Compose editor" }),
  ).toHaveAttribute("href", "/applications/app?tab=compose");
  expect(state.reads()).toBe(0);
  await page.getByLabel("Name", { exact: true }).fill("Renamed stack");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/app$/);
  expect(state.writes[0].body.name).toBe("Renamed stack");
  expect(state.writes[0].body.secrets).not.toHaveProperty("compose");
  expect(state.reads()).toBe(0);
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  await page.getByRole("link", { name: "Open Compose editor" }).click();
  await expect(page).toHaveURL(/\/applications\/app\?tab=compose$/);
  await expect(composeLines(page)).toContainText("nginx:alpine");
  expect(state.reads()).toBe(1);
});

test("create an application from YAML without a Git connection", async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.goto("/projects/project");
  await page
    .getByRole("button", { name: "New application", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("main");
  await dialog.getByLabel("Name", { exact: true }).fill("Raw stack");
  await dialog
    .getByRole("combobox", { name: "Select Source", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Direct Compose", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Select git", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("Repository", { exact: true })).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Select server", exact: true })
    .click();
  await page.getByRole("option", { name: "server", exact: true }).click();
  const editor = dialog.getByRole("textbox", {
    name: "Compose YAML",
    exact: true,
  });
  await fillCompose(editor, initialYAML);
  await editor.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("compose-create-light.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page).toHaveURL(/applications\/app$/);
  expect(state.writes[0].body).toMatchObject({
    kind: "application",
    name: "Raw stack",
    parentId: "environment",
    data: {
      source: "compose",
      engine: "compose",
      gitId: "",
      serverId: "server",
      file: "compose.yaml",
    },
    secrets: { compose: initialYAML },
  });
  expect(JSON.stringify(state.writes[0].body.data)).not.toContain(initialYAML);
});

test("edit, recover from stale saves and deploy the saved revision", async ({
  page,
}, info) => {
  const state = await setup(page, true);
  await page.goto("/applications/app");
  await page.getByRole("tab", { name: /^compose$/i }).click();
  const editor = page.getByRole("textbox", {
    name: "Compose YAML",
    exact: true,
  });
  await expect(composeLines(page)).toContainText("nginx:alpine");
  const edited = initialYAML.replace("nginx:alpine", "nginx:stable-alpine");
  await fillCompose(editor, edited);
  state.conflict(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Application changed; reload before saving", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(composeLines(page)).toContainText("nginx:stable-alpine");
  await page.getByRole("button", { name: "Reload saved document" }).click();
  await expect(composeLines(page)).not.toContainText("nginx:stable-alpine");
  await fillCompose(editor, edited);
  state.conflict(false);
  const dark = page.getByRole("button", { name: "Use dark theme" });
  if (await dark.isVisible()) await dark.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("compose-edit-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save & deploy", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: /^deployments$/i }),
  ).toHaveAttribute("data-state", "active");
  expect(state.writes.at(-2)?.body).toEqual({ yaml: edited, version: 1 });
  expect(state.writes.at(-1)?.body).toEqual({ version: 2 });
});

test("viewers cannot open the Compose source", async ({ page }) => {
  const state = await setup(page, true, false);
  await page.goto("/applications/app");
  await expect(
    page.getByRole("heading", { name: "app", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /^compose$/i })).toHaveCount(0);
  expect(state.reads()).toBe(0);
});

test("deployment logs expose the stored failure reason", async ({ page }) => {
  await setup(page, true);
  await page.route("**/api/v1/deployments/deployment/events", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: 'event: log\ndata: {"message":"\\u001b[32mUsing the saved Compose document snapshot\\u001b[0m"}\n\nevent: log\ndata: {"message":"Deployment failed; checking previous release"}\n\nevent: status\ndata: {"state":"failed","error":"render Compose configuration: invalid published port"}\n\n',
    }),
  );
  await page.goto("/applications/app?deployment=deployment");
  await expect(page.getByRole("alert")).toContainText(
    "render Compose configuration: invalid published port",
  );
  await expect(page.locator("pre")).toContainText(
    "Using the saved Compose document snapshot",
  );
  await expect(page.locator("pre")).not.toContainText("[32m");
  await expect(page.locator("pre")).not.toContainText("[0m");
});

test("Monaco provides local YAML tooling under the production content policy", async ({
  page,
}, info) => {
  const state = await setup(page, true);
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).origin !==
      new URL(info.project.use.baseURL as string).origin
    )
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("Could not create web worker"))
      errors.push(message.text());
  });
  await page.route("**/applications/app", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const hashes = [
      ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi),
    ]
      .filter(
        ([, attributes, source]) => !/\bsrc\s*=/i.test(attributes) && source,
      )
      .map(
        ([, , source]) =>
          `'sha256-${createHash("sha256").update(source).digest("base64")}'`,
      )
      .join(" ");
    await route.fulfill({
      response,
      body: html,
      headers: {
        ...response.headers(),
        "Content-Security-Policy": `default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'`,
      },
    });
  });
  await page.goto("/applications/app");
  await page.getByRole("tab", { name: /^compose$/i }).click();
  const editor = page.getByRole("textbox", {
    name: "Compose YAML",
    exact: true,
  });
  await expect(composeLines(page)).toContainText("nginx:alpine");
  await fillCompose(
    editor,
    "services:\n  web:\n    image: nginx:alpine\n    definitely_invalid_field: true\n",
  );
  await expect(
    page
      .locator(
        ".monaco-editor .squiggly-error, .monaco-editor .squiggly-warning",
      )
      .first(),
  ).toBeVisible({ timeout: 30000 });
  await fillCompose(
    editor,
    "services:\n      web:\n            image: nginx:alpine\n",
  );
  await page.getByRole("button", { name: "Format", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => state.writes.at(-1)?.body.yaml)
    .toContain("\n  web:\n");
  const wrap = page.getByRole("button", { name: "Toggle word wrap" });
  await expect(wrap).toHaveAttribute("aria-pressed", "true");
  await wrap.click();
  await expect(wrap).toHaveAttribute("aria-pressed", "false");
  await fillCompose(editor, "services:\n  web:\n    ima");
  await editor.press("Control+Space");
  await expect(page.locator(".suggest-widget.visible")).toBeVisible();
  await expect(page.locator(".suggest-widget.visible")).toContainText("image");
  await editor.press("Escape");
  await editor.press("Tab");
  await expect(editor).not.toBeFocused();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("Compose edits survive cancelled navigation and can be explicitly discarded", async ({
  page,
}) => {
  await setup(page, true);
  await page.goto("/applications/app?tab=compose");
  const editor = page.getByRole("textbox", {
    name: "Compose YAML",
    exact: true,
  });
  await expect(composeLines(page)).toContainText("nginx:alpine");
  await fillCompose(
    editor,
    initialYAML.replace("nginx:alpine", "nginx:stable-alpine"),
  );
  await page.getByRole("tab", { name: "overview", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(composeLines(page)).toContainText("nginx:stable-alpine");
  await page.getByRole("tab", { name: "overview", exact: true }).click();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/tab=overview/);
  await expect(editor).toHaveCount(0);
});
