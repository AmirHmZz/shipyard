import { buildInfoFixture } from "./build-info";
type TestSource = { send(message: string, id?: string): void };
declare global {
  interface Window {
    testSources: TestSource[];
  }
}
import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

async function setup(
  page: Page,
  source = "compose",
  writable = true,
  withRoutes = true,
) {
  const writes: Record<string, unknown>[] = [];
  let volumeReads = 0;
  await page.addInitScript(() => {
    class FakeEventSource {
      static CLOSED = 2;
      readyState = 1;
      handlers = new Map<string, ((event: MessageEvent) => void)[]>();
      constructor(public url: string) {
        window.testSources ??= [];
        window.testSources.push(this);
      }
      addEventListener(name: string, handler: (event: MessageEvent) => void) {
        this.handlers.set(name, [...(this.handlers.get(name) || []), handler]);
      }
      send(message: string, id = "") {
        for (const handler of this.handlers.get("log") || [])
          handler(
            new MessageEvent("log", {
              data: JSON.stringify({ message }),
              lastEventId: id,
            }),
          );
      }
      close() {
        this.readyState = 2;
      }
    }
    Object.defineProperty(window, "EventSource", { value: FakeEventSource });
  });
  function resource(id: string, kind: string, parentId = "", data = {}) {
    return {
      createdAt: "2026-10-19T00:00:00Z",
      updatedAt: "2026-10-19T00:00:00Z",
      id,
      kind,
      parentId,
      data,
      name: id,
      teamId: "team",
      version: 1,
      canWrite: writable,
      secretKeys: [],
      variables: {},
    };
  }
  const app = resource("app", "application", "environment", {
    source,
    engine: source === "compose" ? "compose" : "dockerfile",
    serverId: "server",
    gitId: "git",
    repository: "owner/app",
    branch: "main",
    context: ".",
    file: source === "compose" ? "compose.yaml" : "Dockerfile",
    port: 8080,
    healthPath: "/ready",
    healthTimeout: 120,
  });
  const resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("environment", "environment", "project"),
    resource("server", "server"),
    resource("git", "git", "", { provider: "gitea" }),
    app,
    resource("route", "route", "app", {
      service: "app",
      protocol: "https",
      targetPort: 8080,
      domain: "app.example.com",
    }),
  ];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
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
            name: "Operator",
            admin: true,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources"))
      return route.fulfill({
        json: withRoutes
          ? resources
          : resources.filter((resource) => resource.kind !== "route"),
      });
    if (path.endsWith("/resources/app") && request.method() === "PUT") {
      const body = request.postDataJSON();
      writes.push(body);
      return route.fulfill({ json: { ...app, data: body.data } });
    }
    if (path.endsWith("/repositories"))
      return route.fulfill({ json: [{ full_name: "owner/app" }] });
    if (path.endsWith("/branches"))
      return route.fulfill({ json: [{ name: "main" }] });
    if (path.endsWith("/runtime"))
      return route.fulfill({
        json: { status: "running", containers: ["a".repeat(64)] },
      });
    if (path.endsWith("/volumes")) {
      volumeReads++;
      return route.fulfill({
        json: {
          volumes: [
            {
              name: "app-data",
              serverId: "server",
              serverName: "Current server",
              type: "named",
              driver: "local",
              createdAt: "2026-10-19T07:20:19Z",
              mounts: [
                { service: "db", container: "a".repeat(64), path: "/data" },
              ],
              inUse: true,
              sizeBytes: 2097152,
              measuredAt: "2026-10-19T07:20:19Z",
            },
            {
              name: "empty",
              serverId: "old",
              serverName: "Previous server",
              type: "anonymous",
              driver: "local",
              createdAt: "",
              mounts: [],
              inUse: false,
              sizeBytes: 0,
              measuredAt: "2026-10-19T07:20:19Z",
            },
            {
              name: "unsupported",
              serverId: "old",
              serverName: "Previous server",
              type: "named",
              driver: "remote",
              createdAt: "",
              mounts: [],
              inUse: false,
              sizeBytes: null,
              measuredAt: null,
            },
          ],
          errors: [
            {
              serverId: "offline",
              error: "Unable to connect to storage server",
            },
          ],
        },
      });
    }
    if (path.includes("/deployments/"))
      return route.fulfill({
        json: {
          phase: "",
          commit: "",
          error: "",
          releaseId: "",
          rollbackId: "",
          createdAt: "2026-10-19T00:00:00Z",
          updatedAt: "2026-10-19T00:00:00Z",
          id: "deploy",
          applicationId: "app",
          state: "building",
        },
      });
    if (
      path.endsWith("/deployments") ||
      path.endsWith("/releases") ||
      path.endsWith("/metrics")
    )
      return route.fulfill({ json: [] });
    throw new Error(`Unexpected API ${request.method()} ${path}`);
  });
  return { writes, volumeReads: () => volumeReads };
}

test("volumes load on demand with distinct data sizes and partial server failures", async ({
  page,
}) => {
  const state = await setup(page, "compose", false);
  await page.goto("/applications/app");
  await expect(page.getByRole("tab", { name: /^volumes$/i })).toBeVisible();
  expect(state.volumeReads()).toBe(0);
  await page.getByRole("tab", { name: /^volumes$/i }).click();
  await expect(page.getByRole("row", { name: /app-data/ })).toContainText(
    "2 MiB",
  );
  await expect(page.getByRole("row", { name: /empty/ })).toContainText("0 B");
  await expect(page.getByRole("row", { name: /unsupported/ })).toContainText(
    "Unavailable",
  );
  await expect(
    page.getByText(/Unable to connect to storage server/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(state.volumeReads).toBe(2);
});

test("clear container logs preserves the connection, resets numbering and cancels pending lines", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/applications/app?tab=logs");
  await expect(page.getByRole("button", { name: "Clear logs" })).toBeVisible();
  await page.evaluate(() =>
    window.testSources[window.testSources.length - 1].send("old line"),
  );
  await expect(page.locator("pre")).toContainText("old line");
  await page.evaluate(() =>
    window.testSources[window.testSources.length - 1].send("pending line"),
  );
  const connections = await page.evaluate(() => window.testSources.length);
  await page.getByRole("button", { name: "Clear logs" }).click();
  await expect(page.locator("pre")).not.toContainText("old line");
  await expect(page.locator("pre")).not.toContainText("pending line");
  await page.evaluate(() =>
    window.testSources[window.testSources.length - 1].send("new line"),
  );
  await expect(page.locator("pre")).toContainText("1new line");
  expect(await page.evaluate(() => window.testSources.length)).toBe(
    connections,
  );
});

test("deployment logs ignore replayed IDs while retaining identical distinct messages", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/applications/app?tab=deployments&deployment=deploy");
  await expect(page.locator("pre")).toBeVisible();
  await page.evaluate(() => {
    const stream = window.testSources[window.testSources.length - 1];
    stream.send("Repeated diagnostic", "1");
    stream.send("Repeated diagnostic", "1");
    stream.send("Repeated diagnostic", "2");
  });
  await expect(page.locator("pre > div")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Clear logs" })).toHaveCount(0);
});

for (const source of ["git", "compose"])
  test(`${source} settings translate legacy HTTP readiness and omit generic port fields`, async ({
    page,
  }) => {
    const state = await setup(page, source);
    await page.goto("/configure/application/app?return=/applications/app");
    await expect(
      page.getByRole("heading", { name: "Edit application" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Application port", { exact: false }),
    ).toHaveCount(0);
    await expect(page.getByLabel("HTTP path", { exact: true })).toHaveValue(
      "/ready",
    );
    await page.getByRole("button", { name: "Remove readiness check" }).click();
    await page.getByRole("button", { name: "Add HTTP check" }).click();
    await page
      .getByLabel("Service", { exact: true })
      .fill(source === "git" ? "app" : "private");
    await page.getByLabel("Port", { exact: true }).fill("9000");
    await page.getByLabel("HTTP path", { exact: true }).fill("/live");
    await page
      .getByRole("button", { name: "Save application", exact: true })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    const data = state.writes[0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("port");
    expect(data).not.toHaveProperty("healthPath");
    expect(data.readinessChecks).toEqual([
      {
        service: source === "git" ? "app" : "private",
        port: 9000,
        path: "/live",
      },
    ]);
  });

for (const source of ["git", "compose"]) {
  test(`${source} readiness can be disabled without losing saved checks or the startup deadline`, async ({
    page,
  }) => {
    const state = await setup(page, source);
    await page.goto("/configure/application/app");
    await expect(
      page.getByRole("combobox", {
        name: "Select Readiness policy",
        exact: true,
      }),
    ).toHaveText("Additional readiness checks");
    await page.getByLabel("Readiness deadline (seconds)").fill("300");
    // Incomplete edits to disabled checks must not prevent saving the policy.
    await page.getByLabel("HTTP path", { exact: true }).fill("");
    await page
      .getByRole("combobox", { name: "Select Readiness policy", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Container status", exact: true })
      .click();
    await expect(page.getByLabel("HTTP path", { exact: true })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Save application", exact: true })
      .click();
    await expect.poll(() => state.writes.length).toBe(1);
    expect(state.writes[0]).toMatchObject({
      data: {
        readinessMode: "container",
        healthTimeout: 300,
        readinessChecks: [{ service: "app", port: 8080, path: "/ready" }],
      },
    });
  });
}

test("private previews can be enabled without routes or DNS settings", async ({
  page,
}) => {
  const state = await setup(page, "git", true, false);
  await page.goto("/applications/app?tab=previews");
  await page
    .getByRole("switch", { name: "Enable PR previews", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Preview routing", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Private preview", exact: true })
    .click();
  await expect(page.getByLabel("Preview wildcard domain")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save preview settings", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(
    (state.writes[0].data as Record<string, unknown>).previewRouting,
  ).toEqual({ mode: "private" });
  expect((state.writes[0].data as Record<string, unknown>).previews).toBe(true);
});
