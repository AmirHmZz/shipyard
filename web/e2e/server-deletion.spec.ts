import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

async function setup(
  page: Page,
  { admin = true, local = false, deleting = false } = {},
) {
  const host = {
    secretKeys: [],
    variables: {},
    createdAt: "2026-10-19T00:00:00Z",
    updatedAt: "2026-10-19T00:00:00Z",
    id: "host",
    kind: "server",
    name: "Production",
    parentId: "",
    teamId: "",
    canWrite: admin,
    version: 1,
    data: {
      connection: local ? "local" : "ssh",
      host: "192.0.2.1",
      port: 22,
      user: "root",
      fingerprint: "SHA256:test",
      authMethod: "private_key",
      ...(deleting
        ? { deleting: true, deletionError: "SSH disconnected" }
        : {}),
    },
  };
  const plan = {
    id: "plan",
    serverId: "host",
    serverName: "Production",
    daemonId: "engine",
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    remove: [
      {
        kind: "application",
        id: "app",
        name: "Website",
        reason: "Includes previews and history",
      },
      {
        kind: "volume",
        id: "state",
        name: "website_state",
        reason: "Owned application data",
      },
    ],
    preserve: [
      {
        kind: "volume",
        id: "external",
        name: "external_database",
        reason: "External volume",
      },
      {
        kind: "bind",
        id: "data",
        name: "/srv/data",
        reason: "Bind-mounted data",
      },
    ],
    blockers: [],
  };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let conflict = false;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/version"))
      return route.fulfill({ json: buildInfoFixture });
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: {
            email: "user@example.test",
            totp: false,
            id: "user",
            name: "Admin",
            admin,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources")) return route.fulfill({ json: [host] });
    if (path.endsWith("/deletion-plan")) return route.fulfill({ json: plan });
    if (path.endsWith("/deletion"))
      return route.fulfill({
        json: {
          plan,
          stage: "removing application containers",
          error: "SSH disconnected",
          jobId: "job",
          done: false,
        },
      });
    if (req.method() !== "GET") {
      writes.push({ path, body: req.postDataJSON() });
      if (conflict && req.method() === "DELETE")
        return route.fulfill({
          status: 409,
          json: { error: "Inventory changed; review a fresh deletion plan" },
        });
      if (req.method() === "DELETE") {
        host.data = {
          ...host.data,
          deleting: true,
          deletionError: "SSH disconnected",
        };
        return route.fulfill({ status: 202, json: { ok: true, jobId: "job" } });
      }
      if (path.endsWith("/connection"))
        return route.fulfill({ json: { ok: true } });
      return route.fulfill({ status: 202, json: { jobId: "job" } });
    }
    if (path.endsWith("/metrics")) return route.fulfill({ json: [] });
    throw new Error(`Unexpected ${req.method()} ${path}`);
  });
  return {
    writes,
    conflict: () => {
      conflict = true;
    },
  };
}
test("server deletion is a full-page review with exact confirmation and explicit data acknowledgement", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/servers");
  await page
    .getByRole("button", { name: "Delete server", exact: true })
    .click();
  await expect(page).toHaveURL(/\/servers\/host\/delete$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Review cleanup inventory" }).click();
  await expect(page.getByText("website_state", { exact: true })).toBeVisible();
  await expect(
    page.getByText("external_database", { exact: true }),
  ).toBeVisible();
  const remove = page.getByRole("button", {
    name: "Delete server",
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await page.getByLabel("Type Production to confirm").fill("production");
  await page.getByLabel("I understand that owned application volumes").check();
  await expect(remove).toBeDisabled();
  await page.getByLabel("Type Production to confirm").fill("Production");
  await expect(remove).toBeEnabled();
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  expect(state.writes).toHaveLength(0);
  await expect(page).toHaveURL(/\/servers$/);
  await page.goto("/servers/host/delete");
  await page.getByRole("button", { name: "Review cleanup inventory" }).click();
  await page.getByLabel("Type Production to confirm").fill("Production");
  await page.getByLabel("I understand that owned application volumes").check();
  await page
    .getByRole("button", { name: "Delete server", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry cleanup" }),
  ).toBeVisible();
  expect(state.writes[0].body).toEqual({
    planId: "plan",
    name: "Production",
    deleteVolumes: true,
  });
});
test("changed inventory requires a fresh review", async ({ page }) => {
  const state = await setup(page);
  state.conflict();
  await page.goto("/servers/host/delete");
  await page.getByRole("button", { name: "Review cleanup inventory" }).click();
  await page.getByLabel("Type Production to confirm").fill("Production");
  await page.getByLabel("I understand that owned application volumes").check();
  await page
    .getByRole("button", { name: "Delete server", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .getByText("Inventory changed; review a fresh deletion plan"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review cleanup inventory" }),
  ).toBeVisible();
  await expect(page.getByLabel("Type Production to confirm")).toHaveCount(0);
});
test("failed cleanup can retry and repair credentials on the page", async ({
  page,
}) => {
  const state = await setup(page, { deleting: true });
  await page.goto("/servers/host/delete");
  await page.getByRole("button", { name: "Retry cleanup" }).click();
  expect(state.writes[0].path).toContain("/deletion/retry");
  await page.getByRole("button", { name: "Repair connection" }).click();
  await page.getByLabel("SSH host", { exact: true }).fill("192.0.2.2");
  await page.getByRole("button", { name: "Verify & save connection" }).click();
  await expect(
    page.getByRole("heading", { name: "Repair SSH connection" }),
  ).toHaveCount(0);
  expect(state.writes.at(-1)?.body.host).toBe("192.0.2.2");
  expect(state.writes.at(-1)?.body.secrets).toEqual({});
});
test("local host and nonadministrators cannot delete servers", async ({
  page,
}) => {
  await setup(page, { local: true });
  await page.goto("/servers");
  await expect(
    page.getByRole("button", { name: "Delete server", exact: true }),
  ).toHaveCount(0);
  await page.goto("/servers/host/delete");
  await expect(
    page.getByText(
      "Shipyard's local host and system infrastructure cannot be deleted.",
    ),
  ).toBeVisible();
});
test("nonadministrators cannot open the cleanup page", async ({ page }) => {
  await setup(page, { admin: false });
  await page.goto("/servers/host/delete");
  await expect(
    page.getByText("Platform administrator access required"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review cleanup inventory" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`cleanup review fits the viewport in ${theme} theme`, async ({
    page,
  }, info) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("shipyard-theme", theme),
      theme,
    );
    await setup(page);
    await page.goto("/servers/host/delete");
    await page
      .getByRole("button", { name: "Review cleanup inventory" })
      .click();
    await expect(
      page.getByRole("heading", { name: /Will be removed/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`cleanup-${theme}.png`),
      fullPage: true,
    });
  });
}
