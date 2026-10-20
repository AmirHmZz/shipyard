import { expect, test, type Page } from "@playwright/test";

import type { components } from "../src/lib/schema";

type Resource = components["schemas"]["Resource"];
type ResourceInput = components["schemas"]["ResourceInput"];
function resource(id: string, input: ResourceInput): Resource {
  return {
    id,
    ...input,
    name: input.name || String(input.data.domain || id),
    parentId: input.parentId || "",
    teamId: input.teamId || "",
    secretKeys: [],
    canWrite: true,
    version: 1,
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z",
  };
}
async function dashboard(page: Page, initial: Resource[] = []) {
  const resources = [...initial];
  const writes: ResourceInput[] = [];
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
          csrf: "test-csrf",
        },
      });
    if (path === "/api/v1/resources") {
      if (request.method() === "GET") return route.fulfill({ json: resources });
      const input: ResourceInput = request.postDataJSON();
      writes.push(input);
      const saved = resource(`new-${writes.length}`, input);
      resources.push(saved);
      return route.fulfill({ status: 201, json: saved });
    }
    if (path === "/api/v1/dns/test")
      return route.fulfill({ json: { ok: true } });
    if (path.endsWith("/records"))
      return route.fulfill({
        json: [
          {
            id: "ns1",
            type: "NS",
            name: "example.com",
            content: "ns1.example.net.",
            ttl: 7200,
            proxied: false,
          },
          {
            id: "ns2",
            type: "NS",
            name: "example.com",
            content: "ns2.example.net.",
            ttl: 7200,
            proxied: false,
          },
        ],
      });
    if (path.endsWith("/runtime"))
      return route.fulfill({ json: { containers: [] } });
    if (path === "/api/v1/deployments" || /\/(metrics|releases)$/.test(path))
      return route.fulfill({ json: [] });
    throw new Error(`Unexpected API request: ${request.method()} ${path}`);
  });
  return writes;
}

test("provider names and logos render while saved provider IDs stay unchanged", async ({
  page,
}) => {
  const writes = await dashboard(page);
  await page.goto("/integrations");
  const card = (name: string) =>
    page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(name, { exact: true }) });
  await card("Source control")
    .getByRole("button", { name: "Add connection" })
    .click();
  await page
    .getByRole("button", { name: "Advanced: manual credentials" })
    .click();
  const git = page.getByRole("main");
  const select = git.getByRole("combobox", { name: "Select Provider" });
  await expect(select).toHaveText("GitHub");
  await expect(select.locator("img")).toHaveAttribute(
    "src",
    "/brands/github.svg",
  );
  await expect
    .poll(() =>
      select
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await select.click();
  const gitea = page.getByRole("option", { name: "Gitea", exact: true });
  await expect(gitea.locator("img")).toHaveAttribute(
    "src",
    "/brands/gitea.svg",
  );
  await gitea.click();
  await expect(select).toHaveText("Gitea");
  await git.getByLabel("Name", { exact: true }).fill("Source control test");
  await git.getByLabel("Gitea instance URL").fill("https://git.example.com");
  await git.getByRole("button", { name: "Save connection" }).click();
  await expect(page).toHaveURL(/integrations$/);
  await card("DNS providers")
    .getByRole("button", { name: "Add connection" })
    .click();
  const dns = page.getByRole("main");
  const dnsSelect = dns.getByRole("combobox", { name: "Select DNS provider" });
  await expect(dnsSelect).toHaveText("Cloudflare");
  await dnsSelect.click();
  await expect(
    page.getByRole("option", { name: "Cloudflare", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "ArvanCloud", exact: true }).click();
  await expect(dnsSelect).toHaveText("ArvanCloud");
  await dns.getByLabel("Name", { exact: true }).fill("DNS test");
  await dns.getByLabel("Provider API token").fill("test-token");
  await expect(
    dns.getByRole("button", { name: "Save provider" }),
  ).toBeDisabled();
  await dns.getByRole("button", { name: "Test provider", exact: true }).click();
  await dns.getByRole("button", { name: "Save provider" }).click();
  await expect(page).toHaveURL(/integrations$/);
  expect(writes.map((w) => w.data.provider)).toEqual(["gitea", "arvancloud"]);
});

test("compact project cards support whole-card links, independent menus and hierarchy breadcrumbs", async ({
  page,
}, testInfo) => {
  await dashboard(page, [
    resource("team", { kind: "team", name: "Platform", data: {} }),
    resource("project", {
      kind: "project",
      name: "Customer platform",
      teamId: "team",
      parentId: "team",
      data: {},
    }),
    resource("production", {
      kind: "environment",
      name: "Production",
      parentId: "project",
      data: {},
    }),
    resource("staging", {
      kind: "environment",
      name: "Staging",
      parentId: "project",
      data: {},
    }),
    resource("app", {
      kind: "application",
      name: "Web frontend",
      parentId: "staging",
      data: { engine: "dockerfile", repository: "team/frontend" },
    }),
  ]);
  await page.goto("/projects");
  const card = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("link", { name: "Customer platform", exact: true }),
  });
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).paddingTop)).toBe(
    "0px",
  );
  await page.screenshot({
    path: testInfo.outputPath("projects.png"),
    fullPage: true,
  });
  await card.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menuitem", { name: "Edit project" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByRole("dialog", { name: "Edit project" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const box = (await card.boundingBox())!;
  await card.click({ position: { x: 24, y: box.height - 16 } });
  await expect(page).toHaveURL(/\/projects\/project$/);
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects$/);
  await card
    .getByRole("link", { name: "Customer platform", exact: true })
    .click();
  const breadcrumb = page.getByRole("navigation", { name: "breadcrumb" });
  await breadcrumb.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await card
    .getByRole("link", { name: "Customer platform", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/\/projects\/project$/);
  await page.goto("/applications/app");
  await expect(
    page.getByRole("heading", { name: "Web frontend", exact: true }),
  ).toBeVisible();
  await breadcrumb.getByRole("link", { name: "Staging", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/project\?environment=staging$/);
  await expect(
    page.getByRole("tab", { name: "Staging", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("tables have aligned spacing without empty card padding and the favicon loads", async ({
  page,
}, testInfo) => {
  await dashboard(page, [
    resource("zone", {
      kind: "zone",
      name: "Example",
      parentId: "dns",
      data: { domain: "example.com", providerZoneId: "example.com" },
    }),
  ]);
  await page.goto("/dns");
  await page.getByRole("link", { name: "example.com", exact: true }).click();
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(3);
  const geometry = await table.evaluate((el) => {
    const card = el.closest('[data-slot="card"]')!;
    const head = el.querySelector("th")!;
    const cell = el.querySelector("td")!;
    return {
      gapTop: el.getBoundingClientRect().top - card.getBoundingClientRect().top,
      gapBottom:
        card.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom,
      headInset: getComputedStyle(head).paddingLeft,
      cellInset: getComputedStyle(cell).paddingLeft,
    };
  });
  expect(geometry.gapTop).toBeLessThanOrEqual(1);
  expect(geometry.gapBottom).toBeLessThanOrEqual(1);
  expect(geometry.headInset).toBe(geometry.cellInset);
  expect(parseFloat(geometry.headInset)).toBeGreaterThanOrEqual(20);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(icon).toBe("/favicon.svg");
  const response = await page.request.get(icon!);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("image/svg+xml");
  await page.screenshot({
    path: testInfo.outputPath("dns-table-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: testInfo.outputPath("dns-table-dark.png"),
    fullPage: true,
  });
});
