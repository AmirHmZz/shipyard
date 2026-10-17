import { test, expect, type Page } from "@playwright/test";
async function mock(page: Page, admin = true) {
  const resource = (id: string, kind: string, parentId = "", data = {}) => ({
    id,
    kind,
    parentId,
    data,
    name: id,
    teamId: "team",
    version: 1,
    canWrite: true,
    secretKeys: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("env", "environment", "project"),
    resource("server", "server"),
    resource("cloudflare", "dns", "", { provider: "cloudflare" }),
    resource("arvan", "dns", "", { provider: "arvancloud" }),
    resource("zone", "zone", "cloudflare", {
      domain: "example.com",
      providerZoneId: "existing",
    }),
    resource("app", "application", "env", {
      source: "git",
      engine: "compose",
      serverId: "server",
      gitId: "git",
      repository: "owner/repo",
      branch: "main",
      context: ".",
      file: "compose.yaml",
    }),
    resource("git", "git", "", { provider: "gitea" }),
    resource("shared", "network", "server", {
      serverId: "server",
      dockerId: "docker-shared",
      dockerName: "shared",
      status: "ready",
      subnet: "172.25.0.0/24",
    }),
  ];
  const writes: any[] = [];
  let zoneFailure = false;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: { user: { id: "user", name: "User", admin }, csrf: "csrf" },
      });
    if (path.endsWith("/resources")) {
      if (req.method() === "GET") return route.fulfill({ json: resources });
      const body = req.postDataJSON();
      writes.push({ path, body });
      const saved = resource("created", body.kind, body.parentId, body.data);
      resources.push(saved);
      return route.fulfill({ json: saved });
    }
    if (path.endsWith("/zones"))
      return zoneFailure
        ? route.fulfill({
            status: 502,
            json: { error: "Provider temporarily unavailable" },
          })
        : route.fulfill({
            json: [
              { id: "existing", name: "example.com" },
              { id: "new", name: "new.example.org" },
            ],
          });
    if (path.endsWith("/services"))
      return route.fulfill({
        json: [
          { name: "web", replicas: 1, ignoredPorts: true },
          { name: "worker", replicas: 1, ignoredPorts: false },
        ],
      });
    if (path.endsWith("/networking")) {
      if (req.method() === "GET")
        return route.fulfill({
          json: {
            version: resources.find((r) => r.id === "app")!.version,
            services: {},
            pending: false,
          },
        });
      writes.push({ path, body: req.postDataJSON() });
      return route.fulfill({ json: { ok: true } });
    }
    if (path.endsWith("/published-ports")) {
      writes.push({ path, body: req.postDataJSON() });
      return route.fulfill({ json: { ok: true } });
    }
    if (path.startsWith("/api/v1/resources/")) {
      const body = req.postDataJSON();
      writes.push({ path, body });
      const saved = resources.find((r) => r.id === path.split("/").at(-1))!;
      Object.assign(saved, { data: body.data, version: saved.version + 1 });
      return route.fulfill({ json: saved });
    }
    if (path.endsWith("/runtime"))
      return route.fulfill({ json: { status: "stopped" } });
    if (
      path.endsWith("/metrics") ||
      path.endsWith("/releases") ||
      path.endsWith("/deployments") ||
      path.endsWith("/repositories") ||
      path.endsWith("/branches")
    )
      return route.fulfill({ json: [] });
    if (path.endsWith("/networks"))
      return route.fulfill({
        json: [
          { Id: "external", Name: "external", Driver: "bridge", Labels: {} },
          { Id: "default", Name: "bridge", Driver: "bridge", Labels: {} },
        ],
      });
    if (path.endsWith("/haproxy"))
      return route.fulfill({
        json: {
          version: 0,
          bindings: {},
          frontends: [
            {
              id: "web",
              name: "Web",
              protocol: "HTTP / HTTPS / gRPC",
              ports: [80, 443],
              addresses: ["0.0.0.0"],
              defaultAddresses: ["0.0.0.0"],
              useDefaults: true,
            },
          ],
          image: "haproxy:3.4-alpine",
        },
      });
    throw new Error(`Unexpected ${req.method()} ${path}`);
  });
  return {
    writes,
    resources,
    failZones: (fail: boolean) => {
      zoneFailure = fail;
    },
  };
}
test("long application and server forms are pages with unsaved-change protection", async ({
  page,
}, info) => {
  await mock(page);
  await page.goto("/projects/project");
  await page.getByRole("button", { name: "Application", exact: true }).click();
  await expect(page).toHaveURL(/\/configure\/application\/new/);
  await expect(
    page.getByRole("heading", { name: "New application", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("Unsaved app");
  await page
    .getByRole("link", { name: "Workspace", exact: true })
    .last()
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/project$/);
  await page.goto("/servers");
  await page
    .getByRole("button", { name: "Connect server", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/configure\/server\/new/);
  await expect(
    page.getByText("Preview base domain (optional)", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("server-page.png"),
    fullPage: true,
  });
});
test("zone creation discovers domains and shows provider logos without naming fields", async ({
  page,
}, info) => {
  const state = await mock(page);
  state.failZones(true);
  await page.goto("/dns");
  await expect(page.getByRole("button", { name: "Browse zones" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  await expect(page).toHaveURL(/\/configure\/zone\/new/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add DNS provider" }),
  ).toHaveCount(0);
  const provider = page.getByRole("combobox", {
    name: "Select DNS provider",
    exact: true,
  });
  await provider.click();
  await expect(
    page
      .getByRole("option", { name: "cloudflare", exact: true })
      .locator("img"),
  ).toHaveAttribute("src", "/brands/cloudflare.svg");
  await page.getByRole("option", { name: "cloudflare", exact: true }).click();
  await expect(
    page.getByText("Provider temporarily unavailable"),
  ).toBeVisible();
  state.failZones(false);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const zone = page.getByRole("combobox", {
    name: "Select available domain",
    exact: true,
  });
  await zone.click();
  await expect(
    page.getByRole("option", { name: "example.com", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: "new.example.org", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("zone-page.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save zone", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toMatchObject({
    name: "new.example.org",
    data: { domain: "new.example.org", providerZoneId: "new" },
  });
});
test("routes select zones and Compose services and only offer secure protocols", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/configure/route/new?parent=app&return=/applications/app");
  await page.getByLabel("Name", { exact: true }).fill("api");
  await page.getByRole("combobox", { name: "Select connected zone" }).click();
  await page.getByRole("option", { name: "example.com", exact: true }).click();
  await page.getByLabel("Subdomain or full hostname").fill("api");
  await page.getByRole("combobox", { name: "Select Compose service" }).click();
  await page.getByRole("option", { name: "web", exact: true }).click();
  await page.getByLabel("Container port", { exact: true }).fill("8080");
  await page.getByRole("combobox", { name: "Select Protocol" }).click();
  await expect(
    page.getByRole("option", { name: "HTTPS", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "gRPC", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "TCP", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "TCP", exact: true }).click();
  await page.getByRole("combobox", { name: "Select TLS mode" }).click();
  await expect(
    page.getByRole("option", { name: "off", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "TLS passthrough" }).click();
  await expect(
    page.getByText("Verified TLS to backend", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Redirect HTTP to HTTPS", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save route" }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body.data).toMatchObject({
    domain: "api.example.com",
    service: "web",
    tls: "passthrough",
    protocol: "tcp",
  });
  expect(state.writes[0].body.data).not.toHaveProperty("redirect");
});
test("application networking saves per-service settings and hides admin port controls from operators", async ({
  page,
}, info) => {
  const state = await mock(page, false);
  await page.goto("/applications/app");
  await page.getByRole("tab", { name: "networking", exact: true }).click();
  await expect(
    page.getByText(/Compose port publishing is ignored for/),
  ).toBeVisible();
  const card = page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]').filter({ hasText: /^web$/ }),
  });
  await card
    .getByLabel("Container hostname", { exact: true })
    .fill("api-internal");
  await card
    .getByRole("button", { name: "Connect network", exact: true })
    .click();
  await card.getByRole("combobox", { name: "Network for web" }).click();
  await page.getByRole("option", { name: "shared", exact: true }).click();
  await card
    .getByLabel("Fixed IPv4 (optional)", { exact: true })
    .fill("172.25.0.10");
  await page
    .getByRole("button", { name: "Save networking", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body.services.web).toEqual({
    hostname: "api-internal",
    connections: [{ networkId: "shared", ipv4: "172.25.0.10" }],
  });
  await expect(
    page.getByText("Published ports · administrator only", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("app-networks.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("link", { name: "PR previews", exact: true }),
  ).toHaveCount(0);
});

test("configuration navigation can be cancelled and retried without losing a draft", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/applications/app?tab=networking");
  const hostname = page
    .getByLabel("Container hostname", { exact: true })
    .first();
  await hostname.fill("unsaved-host");
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(hostname).toHaveValue("unsaved-host");
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/configure\/application\/app/);
});

test("application preview settings have deep links and retain wildcard settings when disabled", async ({
  page,
}) => {
  const state = await mock(page);
  await page.goto("/applications/app?tab=previews");
  await expect(
    page.getByText("Pull request previews", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "PR previews", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("switch", { name: "Enable PR previews", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Preview connected zone" }).click();
  await page.getByRole("option", { name: "example.com", exact: true }).click();
  await page
    .getByLabel("Preview wildcard domain", { exact: true })
    .fill("*.preview.example.com");
  await page.getByRole("button", { name: "Save preview settings" }).click();
  await expect.poll(() => state.writes.at(-1)?.body.data.previews).toBe(true);
  expect(state.writes.at(-1)?.body.data).toMatchObject({
    previewDomain: "*.preview.example.com",
    previewZoneId: "zone",
  });
  await page
    .getByRole("switch", { name: "Enable PR previews", exact: true })
    .click();
  await page.getByRole("button", { name: "Save preview settings" }).click();
  await expect.poll(() => state.writes.at(-1)?.body.data.previews).toBe(false);
  expect(state.writes.at(-1)?.body.data.previewDomain).toBe(
    "*.preview.example.com",
  );
  await page.getByRole("tab", { name: "networking", exact: true }).click();
  await expect(page).toHaveURL(/tab=networking/);
});
