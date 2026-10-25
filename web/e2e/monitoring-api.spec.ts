import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

const base = {
  version: 1,
  teamId: "",
  parentId: "",
  secretKeys: [],
  variables: {},
  canWrite: true,
  createdAt: "2026-10-25T00:00:00Z",
  updatedAt: "2026-10-25T00:00:00Z",
};
const proxy = {
  ...base,
  id: "proxy-one",
  kind: "proxy",
  name: "Local SOCKS",
  data: { scheme: "socks5h", host: "localhost", port: 1080 },
};
const server = {
  ...base,
  id: "server-one",
  kind: "server",
  name: "Production",
  data: { host: "host.test", user: "root" },
};
const messenger = {
  ...base,
  id: "bale-one",
  kind: "webhook",
  name: "Operations Bale",
  secretKeys: ["token"],
  data: { provider: "bale", chatId: "@alerts", events: [] },
};
const app = {
  ...base,
  id: "app-one",
  kind: "application",
  name: "Service",
  data: {
    serverId: "server-one",
    source: "compose",
    engine: "compose",
    workload: "service",
  },
};
const policy = {
  enabled: true,
  cpu: 90,
  memory: 90,
  disk: 90,
  sustainedSeconds: 300,
  offlineSeconds: 60,
  destinations: ["bale-one"],
};
function point() {
  return {
    resourceId: "server-one",
    cpu: 12,
    memory: 30,
    disk: 40,
    online: true,
    at: new Date().toISOString(),
    valid: true,
    cpuValid: true,
    memoryBytes: 300,
    memoryTotalBytes: 1000,
    network: [],
    devices: [],
    networkRx: null,
    networkTx: null,
    diskRead: null,
    diskWrite: null,
    containers: [],
  };
}
type MonitoringFixture = { admin?: boolean; rejectPolicy?: boolean };
async function installFixture(
  page: Page,
  { admin = true, rejectPolicy = false }: MonitoringFixture = {},
) {
  const calls: { path: string; method: string; body: string | null }[] = [];
  let current = { mode: "inherit", policy };
  let certificate = { proxyId: "" };
  let resources = [proxy, server, messenger, app];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    calls.push({
      path: url.pathname + url.search,
      method: request.method(),
      body: request.postData(),
    });
    if (path === "/version") return route.fulfill({ json: buildInfoFixture });
    if (path === "/telemetry") return route.fulfill({ json: { dsn: "" } });
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          user: {
            id: "actor",
            name: "Operator",
            email: "operator@example.test",
            admin,
            totp: false,
          },
          csrf: "monitoring-csrf",
          maintenance: false,
        },
      });
    if (path === "/resources") {
      if (request.method() === "POST") {
        const payload = request.postDataJSON();
        const created = {
          ...base,
          ...payload,
          id: "new-connection",
          secretKeys: Object.keys(payload.secrets || {}),
        };
        delete created.secrets;
        resources = [...resources, created];
        return route.fulfill({ json: created });
      }
      return route.fulfill({ json: resources });
    }
    if (path === "/monitoring/resources")
      return route.fulfill({
        json: [
          {
            id: server.id,
            kind: "server",
            name: server.name,
            serverId: "",
            status: "online",
            latest: point(),
          },
          {
            id: app.id,
            kind: "application",
            name: app.name,
            serverId: server.id,
            status: "running",
            latest: { ...point(), resourceId: app.id },
          },
        ],
      });
    if (path === "/monitoring/defaults")
      return route.fulfill({
        json: { server: policy, application: { ...policy, enabled: false } },
      });
    if (path === "/monitoring/resources/server-one/policy") {
      if (request.method() === "PUT") {
        if (rejectPolicy) {
          rejectPolicy = false;
          return route.fulfill({
            status: 409,
            json: { error: "Policy save rejected" },
          });
        }
        current = request.postDataJSON();
      }
      return route.fulfill({ json: current });
    }
    if (path === "/servers/server-one/metrics")
      return route.fulfill({ json: [point()] });
    if (path === "/applications/app-one/metrics")
      return route.fulfill({ json: [{ ...point(), resourceId: app.id }] });
    if (path === "/monitoring/resources/app-one/policy")
      return route.fulfill({
        json: { mode: "disabled", policy: { ...policy, enabled: false } },
      });
    if (path === "/monitoring/incidents") return route.fulfill({ json: [] });
    if (path === "/settings/certificates") {
      if (request.method() === "PUT") certificate = request.postDataJSON();
      return route.fulfill({ json: certificate });
    }
    if (path.endsWith("/delivery"))
      return route.fulfill({ json: { state: "none", error: "", at: null } });
    if (path.endsWith("/test"))
      return route.fulfill({
        status: 202,
        json: { jobId: "notification-test" },
      });
    if (path === "/deployments") return route.fulfill({ json: [] });
    if (path === "/applications/app-one/runtime")
      return route.fulfill({
        json: { status: "not_deployed", containers: [], targets: [] },
      });
    return route.fulfill({
      status: 404,
      json: { error: `Unexpected test endpoint: ${path}` },
    });
  });
  return calls;
}
test("administrator changes history and retries a failed policy save without losing edits", async ({
  page,
}) => {
  const calls = await installFixture(page, { rejectPolicy: true });
  await page.goto("/monitoring?resourceId=server-one");
  await expect(
    page.getByRole("heading", { name: "Monitoring", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "History range" }).click();
  await page.getByRole("option", { name: "Last 30 days" }).click();
  await expect(page).toHaveURL(/range=30d/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await expect
    .poll(() => calls.some((call) => call.path.endsWith("/metrics?range=30d")))
    .toBe(true);
  await page.getByRole("radio", { name: "override", exact: true }).check();
  const cpu = page.getByLabel("CPU threshold (%)", { exact: true });
  await cpu.fill("95");

  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await expect(
    page.getByText("Policy save rejected", { exact: true }),
  ).toBeVisible();
  await expect(cpu).toHaveValue("95");
  await page.getByRole("button", { name: "Save policy", exact: true }).click();
  await expect
    .poll(
      () =>
        calls.filter(
          (call) => call.method === "PUT" && call.path.endsWith("/policy"),
        ).length,
    )
    .toBe(2);
  const writes = calls.filter(
    (call) => call.method === "PUT" && call.path.endsWith("/policy"),
  );
  expect(writes.map((call) => JSON.parse(call.body || "{}"))).toEqual([
    expect.objectContaining({
      mode: "override",
      policy: expect.objectContaining({ cpu: 95, destinations: ["bale-one"] }),
    }),
    expect.objectContaining({
      mode: "override",
      policy: expect.objectContaining({ cpu: 95 }),
    }),
  ]);
  await page.getByRole("combobox", { name: "Monitored resource" }).click();
  await page.getByRole("option", { name: "Service · running" }).click();
  await expect(
    page.getByRole("radio", { name: "disabled", exact: true }),
  ).toBeChecked();
  await expect(cpu).toBeDisabled();
  await page.getByRole("combobox", { name: "Monitored resource" }).click();
  await page.getByRole("option", { name: "Production · online" }).click();
  await expect(
    page.getByRole("radio", { name: "override", exact: true }),
  ).toBeChecked();
  await expect(cpu).toBeEnabled();
  await expect(cpu).toHaveValue("95");
});
test("certificate proxy saves independently and notification tests require an explicit click", async ({
  page,
}) => {
  const calls = await installFixture(page);
  await page.goto("/settings?tab=certificates");
  await page.getByRole("combobox", { name: "Certificate proxy" }).click();
  await page.getByRole("option", { name: "Local SOCKS", exact: true }).click();
  await page
    .getByRole("button", { name: "Save connection", exact: true })
    .click();
  await expect
    .poll(
      () =>
        calls.find(
          (call) =>
            call.method === "PUT" &&
            call.path.endsWith("/settings/certificates"),
        )?.body,
    )
    .toBe('{"proxyId":"proxy-one"}');
  await page.goto("/configure/webhook/new?return=/integrations");
  await page.getByLabel("Name", { exact: true }).fill("New Bale");
  await page
    .getByRole("combobox", { name: "Select Notification provider" })
    .click();
  await page.getByRole("option", { name: "Bale", exact: true }).click();
  await page
    .getByLabel("Chat ID or channel username", { exact: true })
    .fill("@operations");
  await page.getByLabel("Bot token", { exact: true }).fill("123:test-token");
  await page
    .getByRole("button", { name: /Create|Save/ })
    .last()
    .click();
  await expect(page).toHaveURL(/\/integrations$/);
  expect(
    calls.filter(
      (call) => call.method === "POST" && call.path.endsWith("/test"),
    ),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Send test notification", exact: true })
    .first()
    .click();
  await expect
    .poll(
      () =>
        calls.filter(
          (call) => call.method === "POST" && call.path.endsWith("/test"),
        ).length,
    )
    .toBe(1);
});
test("non-administrators cannot enter monitoring and make no metric requests", async ({
  page,
}) => {
  const calls = await installFixture(page, { admin: false });
  await page.goto("/monitoring");
  await expect(
    page.getByText("Platform administrator access required.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Monitoring", exact: true }),
  ).toHaveCount(0);
  await page.goto("/servers");
  await expect(page.getByText("Production", { exact: true })).toBeVisible();
  await expect(page.getByText("CPU", { exact: true })).toHaveCount(0);
  await page.goto("/applications/app-one");
  await expect(
    page.getByRole("heading", { name: "Service", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Container resources", { exact: true }),
  ).toHaveCount(0);
  expect(
    calls.filter(
      (call) =>
        call.path.includes("/metrics") || call.path.includes("/monitoring/"),
    ),
  ).toHaveLength(0);
});
