import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

async function automationFixture(page: Page, canWrite = true) {
  const writes: { path: string; body: unknown }[] = [];
  let automation = {
    version: 0,
    restarts: [],
    rules: [],
    lastAction: "",
    lastAt: null,
    lastResult: "",
    lastError: "",
    restartStatus: [],
    upcoming: {},
  };
  let limits = { version: 1, services: {}, applied: {}, pending: false };
  function resource(id: string, kind: string, parentId = "", data = {}) {
    return {
      id,
      kind,
      parentId,
      name: id,
      data,
      version: 1,
      teamId: "team",
      variables: {},
      secretKeys: [],
      canWrite,
      createdAt: "2026-11-15T00:00:00Z",
      updatedAt: "2026-11-15T00:00:00Z",
    };
  }
  const app = resource("app", "application", "environment", {
    workload: "service",
    source: "compose",
    engine: "compose",
    serverId: "server",
    context: ".",
    file: "compose.yaml",
  });
  await page.route("**/api/v1/**", async function api(route) {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path.endsWith("/version"))
      return route.fulfill({ json: buildInfoFixture });
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: {
            id: "operator",
            email: "operator@test.invalid",
            name: "Operator",
            admin: canWrite,
            totp: false,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources"))
      return route.fulfill({
        json: [
          resource("team", "team"),
          resource("project", "project", "team"),
          resource("environment", "environment", "project"),
          resource("server", "server"),
          app,
        ],
      });
    if (path.endsWith("/runtime"))
      return route.fulfill({
        json: {
          status: "running",
          releaseId: "release",
          containers: [],
          targets: [],
        },
      });
    if (path.endsWith("/services"))
      return route.fulfill({
        json: [{ name: "app", replicas: 2, ignoredPorts: false }],
      });
    if (path.endsWith("/automation/preview"))
      return route.fulfill({ json: { upcoming: ["2026-11-16T04:30:00Z"] } });
    if (path.endsWith("/automation")) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        writes.push({ path, body });
        automation = {
          ...automation,
          ...body,
          version: automation.version + 1,
        };
      }
      return route.fulfill({ json: automation });
    }
    if (path.endsWith("/resource-limits")) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        writes.push({ path, body });
        limits = {
          ...limits,
          ...body,
          version: limits.version + 1,
          pending: true,
        };
      }
      return route.fulfill({ json: limits });
    }
    if (
      path.endsWith("/deployments") ||
      path.endsWith("/releases") ||
      path.endsWith("/metrics")
    )
      return route.fulfill({ json: [] });
    throw new Error(`Unexpected API ${request.method()} ${path}`);
  });
  return { writes };
}

test("save per-service intervals and preview timezone-aware app schedules", async function automation({
  page,
}) {
  const fixture = await automationFixture(page);
  await page.goto("/applications/app?tab=automation");
  await page.getByLabel("Restart periodically").check();
  await page
    .getByRole("spinbutton", { name: "app restart interval" })
    .fill("15");
  await page.getByRole("button", { name: "Add schedule rule" }).click();
  await page
    .getByRole("textbox", { name: "Cron expression" })
    .fill("0 8 * * 1-5");
  await page.getByRole("textbox", { name: "Timezone" }).fill("Asia/Tehran");
  await page.getByRole("button", { name: "Preview schedule" }).click();
  await expect(page.getByText("Upcoming occurrences")).toBeVisible();
  await page.getByRole("button", { name: "Save automation" }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].body).toMatchObject({
    version: 0,
    restarts: [{ service: "app", enabled: true, intervalSeconds: 900 }],
    rules: [
      {
        enabled: true,
        action: "start",
        cron: "0 8 * * 1-5",
        timezone: "Asia/Tehran",
      },
    ],
  });
  await expect(page.getByText("Automation settings saved")).toBeVisible();
});

test("save CPU and RAM caps with next-deployment feedback", async function resources({
  page,
}) {
  const fixture = await automationFixture(page);
  await page.goto("/applications/app?tab=resources");
  await page.getByRole("spinbutton", { name: "app CPU limit" }).fill("0.5");
  await page.getByRole("spinbutton", { name: "app RAM limit" }).fill("256");
  await page.getByRole("button", { name: "Save resource limits" }).click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  expect(fixture.writes[0].body).toEqual({
    version: 1,
    services: { app: { cpus: 0.5, memoryBytes: 268435456 } },
  });
  await expect(
    page.getByText(
      "Saved limits differ from the active release. Deploy to apply.",
    ),
  ).toBeVisible();
});

test("viewers cannot edit automation or resource limits", async function viewer({
  page,
}) {
  const fixture = await automationFixture(page, false);
  await page.goto("/applications/app?tab=automation");
  await expect(
    page.getByRole("button", { name: "Add schedule rule" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save automation" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: /^resources$/i }).click();
  await expect(
    page.getByRole("button", { name: "Save resource limits" }),
  ).toBeDisabled();
  expect(fixture.writes).toHaveLength(0);
});
