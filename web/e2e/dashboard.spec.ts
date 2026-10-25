import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import type { components } from "../src/lib/schema";
type Resource = components["schemas"]["Resource"];

const email = process.env.SHIPYARD_E2E_EMAIL || "admin@shipyard.test";
const password =
  process.env.SHIPYARD_E2E_PASSWORD || "Shipyard-local-test-2026!";
function bootstrapToken() {
  if (process.env.SHIPYARD_BOOTSTRAP_TOKEN)
    return process.env.SHIPYARD_BOOTSTRAP_TOKEN;
  if (process.env.SHIPYARD_E2E_ENV_FILE)
    return (
      readFileSync(process.env.SHIPYARD_E2E_ENV_FILE, "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith("SHIPYARD_BOOTSTRAP_TOKEN="))
        ?.split("=")
        .slice(1)
        .join("=") || ""
    );
  return "";
}

test("installation, project configuration, invitations and viewer boundaries", async ({
  page,
  request,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const state = await (await request.get("/api/v1/auth/status")).json();
  if (state.setupRequired) {
    expect(
      bootstrapToken(),
      "An isolated installation bootstrap token is required for browser tests",
    ).not.toBe("");
    await page.getByLabel("Full name").fill("Local Administrator");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Bootstrap token").fill(bootstrapToken());
    await page.getByRole("button", { name: "Create workspace" }).click();
  } else {
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "A clear view of what’s shipping." }),
  ).toBeVisible();
  const session = await page.request
    .get("/api/v1/auth/me")
    .then((r) => r.json());
  async function mutate(
    client: APIRequestContext,
    path: string,
    data: unknown,
  ) {
    const response = await client.post("/api/v1" + path, {
      data,
      headers: { "X-CSRF-Token": session.csrf },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  const unique = Date.now() + "-" + testInfo.project.name;
  const teamName = "Browser team " + unique;
  await page.goto("/teams");
  await page.getByRole("button", { name: "New team", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(teamName);
  await page.getByRole("button", { name: "Save team" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const resources: Resource[] = await page.request
    .get("/api/v1/resources")
    .then((r) => r.json());
  const team = resources.find((r) => r.name === teamName)!;
  expect(team.canWrite).toBeTruthy();
  const project: Resource = await mutate(page.request, "/resources", {
    kind: "project",
    name: "Customer platform " + unique,
    parentId: team.id,
    data: {},
  });
  const environment: Resource = await mutate(page.request, "/resources", {
    kind: "environment",
    name: "Production",
    parentId: project.id,
    data: {},
  });
  await page.goto("/projects/" + project.id);
  await page.getByRole("button", { name: "Environment variables" }).click();
  await page.getByLabel("Variable name").fill("API_TOKEN");
  await page.getByRole("switch", { name: "Secret", exact: true }).check();
  const secret = "browser-secret-" + unique;
  await page.getByLabel("Value", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Add / replace variable" }).click();
  await expect(
    page.getByRole("cell", { name: "env:API_TOKEN", exact: true }),
  ).toBeVisible();
  expect(
    await page.request
      .get("/api/v1/resources/" + environment.id)
      .then((r) => r.text()),
  ).not.toContain(secret);
  await page.keyboard.press("Escape");
  const server: Resource = await mutate(page.request, "/resources", {
    kind: "server",
    name: "Browser fixture " + unique,
    data: {
      host: "127.0.0.1",
      port: 2222,
      user: "root",
      fingerprint: "SHA256:fixture",
      ipv4: "192.0.2.10",
    },
  });
  const git: Resource = await mutate(page.request, "/resources", {
    kind: "git",
    name: "Browser Gitea " + unique,
    data: { provider: "gitea", url: "https://git.invalid" },
    secrets: {
      token: "test-only-token",
      webhook_secret: "test-only-signing-secret",
    },
  });
  for (const id of [server.id, git.id])
    await mutate(page.request, `/resources/${id}/grants`, {
      teamId: team.id,
      granted: true,
    });
  const app: Resource = await mutate(page.request, "/resources", {
    kind: "application",
    name: "Web frontend " + unique,
    parentId: environment.id,
    data: {
      engine: "dockerfile",
      serverId: server.id,
      gitId: git.id,
      repository: "team/frontend",
      branch: "main",
      context: ".",
      file: "Dockerfile",
      port: 3000,
      healthTimeout: 120,
    },
  });
  await page.goto("/applications/" + app.id);
  await expect(
    page.getByRole("heading", { name: app.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deploy", exact: true }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: /^domains$/i }).click();
  await expect(
    page.getByRole("heading", { name: "Give your application an address" }),
  ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Alerts", exact: true }).click();
    await expect(page).toHaveURL(/monitoring\?view=defaults/);
    const defaults = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText("Server defaults", { exact: true }) });
    await defaults.getByLabel("CPU threshold (%)", { exact: true }).fill("85");
    await defaults.getByRole("button", { name: "Save policy" }).click();
    await expect(
      defaults.getByLabel("CPU threshold (%)", { exact: true }),
    ).toHaveValue("85");
  }
  await page.goto("/projects/" + project.id);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Networks" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Docker networks" }),
    ).toBeVisible();
  }
  const toggle = page.getByRole("button", { name: "Use dark theme" });
  await page.getByRole("button", { name: /Use (light|dark) theme/ }).waitFor();
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("dashboard-dark.png"),
    fullPage: true,
  });

  const invitation = await mutate(
    page.request,
    `/teams/${team.id}/invitations`,
    {
      email: `viewer-${unique}@shipyard.test`,
      role: "viewer",
      projectId: project.id,
    },
  );
  const viewerContext = await context.browser()!.newContext({
    baseURL:
      (testInfo.project.use.baseURL as string) ||
      process.env.SHIPYARD_E2E_URL ||
      "http://127.0.0.1:8788",
    viewport: { width: 390, height: 844 },
  });
  try {
    const viewer = await viewerContext.newPage();
    await viewer.goto(invitation.url);
    await viewer.getByLabel("Full name").fill("Project Viewer");
    await viewer.getByLabel("Password", { exact: true }).fill(password);
    await viewer.getByRole("button", { name: "Accept invitation" }).click();
    await expect(
      viewer.getByRole("heading", { name: "A clear view of what’s shipping." }),
    ).toBeVisible();
    await viewer.goto("/applications/" + app.id);
    await expect(
      viewer.getByRole("heading", { name: app.name, exact: true }),
    ).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Deploy", exact: true }),
    ).toBeDisabled();
    await expect(
      viewer.getByRole("tab", { name: /^terminal$/i }),
    ).toBeDisabled();
    const viewerSession = await viewer.request
      .get("/api/v1/auth/me")
      .then((r) => r.json());
    const denied = await viewer.request.post(
      "/api/v1/applications/" + app.id + "/deploy",
      { data: {}, headers: { "X-CSRF-Token": viewerSession.csrf } },
    );
    expect(denied.status()).toBe(403);
    const terminal = await viewer.request.get(
      "/api/v1/applications/" +
        app.id +
        "/terminal?csrf=" +
        viewerSession.csrf +
        "&container=unrelated",
      { headers: { Origin: new URL(invitation.url).origin } },
    );
    expect(terminal.status()).toBe(403);
    const replay = await viewer.request.post("/api/v1/auth/accept", {
      data: {
        name: "Replay",
        password,
        token: new URL(invitation.url).searchParams.get("token"),
      },
    });
    expect(replay.status()).toBe(400);
  } finally {
    await viewerContext.close();
  }
  for (const path of [
    "/",
    "/projects",
    "/deployments",
    "/networks",
    "/servers",
    "/dns",
    "/integrations",
    "/teams",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main").locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `horizontal overflow on ${path}`,
    ).toBeTruthy();
  }
  await page.getByRole("banner").getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
