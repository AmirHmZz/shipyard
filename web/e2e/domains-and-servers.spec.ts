import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import type { components } from "../src/lib/schema";

type Resource = components["schemas"]["Resource"];
type Input = components["schemas"]["ResourceInput"];
type Certificate = components["schemas"]["CertificateSummary"];
const now = Date.now();
function at(days: number) {
  return new Date(now + days * 86400000).toISOString();
}
function resource(
  id: string,
  kind: string,
  name: string,
  data = {},
  parentId = "",
): Resource {
  return {
    id,
    kind,
    name,
    data,
    variables: {},
    parentId,
    teamId: "",
    canWrite: true,
    version: 1,
    secretKeys: [],
    createdAt: at(-10),
    updatedAt: at(-10),
  };
}
const initial = [
  resource("cloudflare", "dns", "Cloudflare connection", {
    provider: "cloudflare",
  }),
  resource("arvan", "dns", "ArvanCloud connection", { provider: "arvancloud" }),
  resource(
    "example",
    "zone",
    "Production domain",
    { domain: "example.com", providerZoneId: "example-zone" },
    "cloudflare",
  ),
  resource(
    "other",
    "zone",
    "Another domain",
    { domain: "other.com", providerZoneId: "other.com" },
    "arvan",
  ),
  resource("git", "git", "GitHub connection", { provider: "github" }),
  resource("webhook", "webhook", "Operations alerts", {
    url: "https://alerts.example.com",
  }),
];
function certificate(overrides: Partial<Certificate>): Certificate {
  return {
    ownerType: "application",
    routeId: "route",
    applicationId: "app",
    domain: "app.example.com",
    certificateDomain: "*.example.com",
    status: "ready",
    hasCertificate: true,
    issuer: "CN=Test issuer",
    names: ["*.example.com", "example.com"],
    validFrom: at(-45),
    expiresAt: at(45),
    renewalAt: at(15),
    serialNumber: "2a",
    fingerprint: "ab".repeat(32),
    authority: "https://acme.example.com/directory",
    error: "",
    ...overrides,
  };
}
async function mock(page: Page) {
  const resources = structuredClone(initial);
  const requests: string[] = [];
  const writes: Input[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/git/setup/config"))
      return route.fulfill({
        json: {
          origin: "https://shipyard.test",
          giteaCallback:
            "https://shipyard.test/api/v1/git/setup/gitea/callback",
        },
      });
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    requests.push(path);
    if (path === "/api/v1/auth/me")
      return route.fulfill({
        json: {
          user: {
            id: "admin",
            name: "Administrator",
            email: "admin@shipyard.test",
            admin: true,
            totp: false,
          },
          csrf: "csrf",
        },
      });
    if (path === "/api/v1/resources") {
      if (request.method() === "GET") return route.fulfill({ json: resources });
      const input: Input = request.postDataJSON();
      writes.push(input);
      const saved = resource(
        "server",
        input.kind,
        input.name || "",
        input.data,
      );
      saved.secretKeys = Object.keys(input.secrets || {});
      resources.push(saved);
      return route.fulfill({ status: 201, json: saved });
    }
    if (path === "/api/v1/resources/server") {
      const input: Input = request.postDataJSON();
      writes.push(input);
      const saved = resources.find((r) => r.id === "server");
      if (!saved) throw new Error("Expected the saved server fixture");
      saved.name = input.name || "";
      return route.fulfill({ json: saved });
    }
    if (path.endsWith("/records"))
      return route.fulfill({
        json: [
          {
            id: "a",
            name: "app.example.com",
            type: "A",
            content: "192.0.2.10",
            ttl: 300,
            proxied: false,
          },
        ],
      });
    if (path.endsWith("/certificates"))
      return route.fulfill({
        json: [
          certificate({}),
          certificate({
            routeId: "expired",
            domain: "old.example.com",
            certificateDomain: "old.example.com",
            expiresAt: at(-1),
            renewalAt: at(-31),
          }),
          certificate({
            routeId: "renewal",
            domain: "renew.example.com",
            certificateDomain: "renew.example.com",
            status: "renewal_failed",
            expiresAt: at(10),
            renewalAt: at(-20),
            error:
              "Provider is temporarily unavailable. The current certificate is preserved.",
          }),
        ],
      });
    if (path.endsWith("/metrics")) return route.fulfill({ json: [] });
    throw new Error(`Unexpected request ${request.method()} ${path}`);
  });
  return { requests, writes };
}

test("record refresh replaces repeated domain details and fetches fresh records for that zone", async ({
  page,
}, info) => {
  await mock(page);
  let reads = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/zones/example/records", async (route) => {
    expect(route.request().method()).toBe("GET");
    reads++;
    if (reads > 1) await pending;
    await route.fulfill({
      json: [
        {
          id: "a",
          name: "app.example.com",
          type: "A",
          content: reads === 1 ? "192.0.2.10" : "192.0.2.20",
          ttl: 300,
          proxied: false,
        },
      ],
    });
  });
  await page.goto("/dns/example");
  await expect(
    page.getByRole("cell", { name: "192.0.2.10", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Provider records are fetched live.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "example.com", exact: true }),
  ).toHaveCount(1);
  const refresh = page.getByRole("button", {
    name: "Refresh records",
    exact: true,
  });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  release();
  await expect(
    page.getByRole("cell", { name: "192.0.2.20", exact: true }),
  ).toBeVisible();
  await expect(refresh).toBeEnabled();
  expect(reads).toBe(2);
  await page.screenshot({
    path: info.outputPath("records-refresh.png"),
    fullPage: true,
  });
});

test("domains open from a table into scoped records and certificate views", async ({
  page,
}, info) => {
  const { requests } = await mock(page);
  await page.goto("/dns");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(3);
  await expect(
    page.getByRole("combobox", { name: "Select DNS zone" }),
  ).toHaveCount(0);
  expect(requests.some((path) => path.endsWith("/records"))).toBeFalsy();
  await page.getByPlaceholder("Filter domains…").fill("example.com");
  await expect(
    page.getByRole("link", { name: "other.com", exact: true }),
  ).toHaveCount(0);
  await page.getByPlaceholder("Filter domains…").clear();
  await page.screenshot({
    path: info.outputPath("domains.png"),
    fullPage: true,
  });
  const row = page.getByRole("row").filter({
    has: page.getByRole("link", { name: "example.com", exact: true }),
  });
  const box = (await row.boundingBox())!;
  await row.click({ position: { x: 20, y: box.height - 5 } });
  await expect(page).toHaveURL(/\/dns\/example$/);
  await expect(
    page.getByRole("tab", { name: "DNS records", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("cell", { name: "192.0.2.10", exact: true }),
  ).toBeVisible();
  expect(requests).not.toContain("/api/v1/zones/other/records");
  await page.getByRole("tab", { name: "Certificates", exact: true }).click();
  await expect(page).toHaveURL(/tab=certificates/);
  await expect(
    page.getByText("CN=Test issuer", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("SHA-256 fingerprint", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Expired", { exact: true })).toBeVisible();
  await expect(page.getByText("renewal failed", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Provider is temporarily unavailable. The current certificate is preserved.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Renewal eligible from", { exact: true }).first(),
  ).toBeVisible();
  expect(requests).toContain("/api/v1/zones/example/certificates");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: info.outputPath("certificates.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Certificates", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("navigation", { name: "breadcrumb" })
    .getByRole("link", { name: "DNS & domains", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dns$/);
});

test("server forms recommend private keys and keep passwords masked and write-only", async ({
  page,
}, info) => {
  const { writes } = await mock(page);
  await page.goto("/servers");
  await page
    .getByRole("button", { name: "Connect server", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("main");
  const auth = dialog.getByRole("combobox", {
    name: "Select SSH authentication",
  });
  await expect(auth).toHaveText("Private key (recommended)");
  await expect(
    dialog.getByLabel("SSH private key", { exact: true }),
  ).toBeVisible();
  await auth.click();
  await page.getByRole("option", { name: "Password", exact: true }).click();
  await expect(
    dialog.getByLabel("SSH private key", { exact: true }),
  ).toHaveCount(0);
  const password = dialog.getByLabel("SSH password", { exact: true });
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("test-only-password");
  await dialog.getByLabel("Name", { exact: true }).fill("Password host");
  await dialog.getByLabel("SSH hostname / IP").fill("server.example.com");
  await dialog.getByLabel("Verified host fingerprint").fill("SHA256:verified");
  await page.screenshot({
    path: info.outputPath("server-password.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Save server" }).click();
  await expect(page).toHaveURL(/servers$/);
  expect(writes[0].data.authMethod).toBe("password");
  expect(writes[0].secrets).toEqual({ password: "test-only-password" });
  await page.getByRole("button", { name: "Configure", exact: true }).click();
  const edit = page.getByRole("main");
  await expect(edit.getByLabel("SSH password", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    edit.getByLabel("SSH password", { exact: true }),
  ).toHaveAttribute(
    "placeholder",
    "Stored securely. Leave untouched to retain.",
  );
  await edit.getByRole("button", { name: "Save server" }).click();
  await expect(page).toHaveURL(/servers$/);
  expect(writes[1].secrets).toEqual({});
});

test("integrations are grouped with leading provider logos and sidebar spacing", async ({
  page,
}, info) => {
  await mock(page);
  await page.goto("/integrations");
  const source = page.getByRole("region", {
    name: "Source control",
    exact: true,
  });
  const dns = page.getByRole("region", { name: "DNS providers", exact: true });
  const alerts = page.getByRole("region", {
    name: "Notification webhooks",
    exact: true,
  });
  await expect(
    source.getByText("GitHub connection", { exact: true }),
  ).toBeVisible();
  await expect(
    source.getByText("Cloudflare connection", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dns.getByText("Cloudflare connection", { exact: true }),
  ).toBeVisible();
  await expect(
    alerts.getByText("Operations alerts", { exact: true }),
  ).toBeVisible();
  for (const brand of ["cloudflare", "arvancloud"]) {
    const logo = dns.locator(`img[src="/brands/${brand}.svg"]`);
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  }
  await source.getByRole("button", { name: "Add connection" }).click();
  await page
    .getByRole("button", { name: "Advanced: manual credentials" })
    .click();
  const select = page
    .getByRole("main")
    .getByRole("combobox", { name: "Select Provider" });
  expect(
    await select.evaluate((el) => {
      const logo = el.querySelector("img")!;
      const label = Array.from(el.querySelectorAll("span")).find(
        (node) => node.textContent === "GitHub" && !node.querySelector("img"),
      )!;
      return (
        logo.getBoundingClientRect().right <= label.getBoundingClientRect().left
      );
    }),
  ).toBeTruthy();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("integrations-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.screenshot({
    path: info.outputPath("integrations-dark.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  const sidebar =
    info.project.name === "mobile"
      ? page.getByRole("dialog")
      : page.locator("aside");
  await expect(
    sidebar.getByText("Keep it focused.", { exact: true }),
  ).toHaveCount(0);
  const brand = sidebar.getByRole("link").first();
  expect(
    await brand.evaluate((el) => parseFloat(getComputedStyle(el).marginTop)),
  ).toBeGreaterThanOrEqual(24);
  expect(
    await brand.evaluate((el) => parseFloat(getComputedStyle(el).marginBottom)),
  ).toBeGreaterThanOrEqual(24);
});
