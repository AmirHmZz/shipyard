import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

async function automationFixture(
  page: Page,
  canWrite = true,
  populated = false,
) {
  const writes: { path: string; body: unknown }[] = [];
  let automation = {
    version: 0,
    restarts: populated
      ? [{ service: "app", enabled: true, intervalSeconds: 86400 }]
      : [],
    rules: populated
      ? [
          {
            id: "weekday",
            enabled: true,
            action: "start",
            cron: "0 8 * * 1-5",
            timezone: "Asia/Tehran",
          },
        ]
      : [],
    lastAction: "",
    lastAt: null,
    lastResult: "",
    lastError: "",
    restartStatus: populated
      ? [
          {
            service: "app",
            container: "container-123456789",
            state: "scheduled",
            nextDue: "2026-11-18T04:30:00Z",
          },
        ]
      : [],
    upcoming: populated ? { weekday: ["2026-11-18T04:30:00Z"] } : {},
  };
  let limits = {
    version: 1,
    services: populated ? { app: { cpus: 0.5, memoryBytes: 536870912 } } : {},
    applied: {},
    pending: false,
  };
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
  const configuredApp = {
    ...app,
    variables: populated
      ? {
          "env:PUBLIC_URL": "https://api.example.com",
          "preview-env:PUBLIC_URL": "https://preview.example.com",
          "env:LONG_CONFIGURATION_VALUE":
            "https://example.com/a/long/path/that/should/wrap/inside/the/variables/table/without/expanding/the/page",
        }
      : {},
    secretKeys: populated ? ["env:DATABASE_URL", "build:PACKAGE_TOKEN"] : [],
  };
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
          configuredApp,
          ...(populated
            ? [
                resource("web-route", "route", "app", {
                  domain: "api.example.com",
                  protocol: "https",
                  service: "app",
                  targetPort: 3000,
                }),
                resource("tcp-route", "route", "app", {
                  protocol: "tcp",
                  listenPort: 5432,
                  service: "database",
                  targetPort: 5432,
                }),
              ]
            : []),
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
        json: [
          { name: "app", replicas: 2, ignoredPorts: false },
          ...(populated
            ? [
                {
                  name: "background-worker-with-a-long-service-name",
                  replicas: 1,
                  ignoredPorts: false,
                },
              ]
            : []),
        ],
      });
    if (path.startsWith("/api/v1/routes/") && path.endsWith("/status"))
      return route.fulfill({
        json: {
          routeId: path.split("/")[4],
          domain: "api.example.com",
          dns: "ready",
          propagation: "ready",
          certificate: "ready",
          routing: "ready",
          error: "",
          expiresAt: null,
          records: [],
        },
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

for (const theme of ["light", "dark"]) {
  test(`application settings remain usable with long content in ${theme} theme`, async function settings({
    page,
  }, info) {
    await page.addInitScript(
      (value) => localStorage.setItem("shipyard-theme:v1", value),
      theme,
    );
    const fixture = await automationFixture(page, true, true);
    for (const tab of ["domains", "resources", "automation", "variables"]) {
      await page.goto(`/applications/app?tab=${tab}`);
      const panel = page.getByRole("tabpanel");
      await expect(panel).toBeVisible();
      if (tab === "domains")
        await expect(panel.getByText("ready", { exact: true })).toHaveCount(8);
      if (tab === "resources")
        await expect(
          panel.getByRole("spinbutton", { name: "app CPU limit" }),
        ).toHaveValue("0.5");
      if (tab === "automation")
        await expect(
          panel.getByRole("textbox", { name: "Cron expression" }),
        ).toHaveValue("0 8 * * 1-5");
      if (tab === "variables") {
        await expect(
          panel.getByText("https://api.example.com", { exact: true }),
        ).toBeVisible();
        await panel
          .getByRole("button", { name: "Edit env:DATABASE_URL", exact: true })
          .click();
        await expect(
          panel.getByLabel("Replacement value", { exact: true }),
        ).toHaveValue("");
        await expect(
          panel.getByRole("switch", { name: "Secret", exact: true }),
        ).toBeChecked();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await page.screenshot({
        path: info.outputPath(`${tab}-${theme}.png`),
        fullPage: true,
      });
    }
    expect(fixture.writes).toHaveLength(0);
  });
}
