import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

async function setup(page: Page, { admin = true, writable = true } = {}) {
  const resource = (id: string, kind: string, parentId = "", data = {}) => ({
    variables: {},
    createdAt: "2026-10-19T00:00:00Z",
    updatedAt: "2026-10-19T00:00:00Z",
    id,
    kind,
    parentId,
    name: id,
    data,
    version: 1,
    secretKeys: [],
    teamId: "team",
    canWrite: writable,
  });
  const resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("environment", "environment", "project"),
    resource("test", "server"),
    resource("other", "server"),
    resource("rustrack", "application", "environment", {
      source: "compose",
      engine: "compose",
      serverId: "test",
    }),
    resource("route", "route", "rustrack", {
      protocol: "https",
      domain: "test.example.com",
      service: "server",
      targetPort: 8080,
    }),
    resource("ingress", "network", "test", {
      serverId: "test",
      dockerId: "docker-ingress",
      managed: true,
      ingressApp: "rustrack",
      subnet: "172.25.0.0/24",
      status: "ready",
    }),
    resource("shared", "network", "other", {
      serverId: "other",
      managed: true,
      status: "ready",
    }),
  ];
  const writes: string[] = [];
  const inventories: string[] = [];
  let failure = false;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
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
            admin,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources")) return route.fulfill({ json: resources });
    if (path.endsWith("/runtime"))
      return route.fulfill({
        json: {
          status: "running",
          containers: ["container"],
          releaseId: "release",
        },
      });
    if (path.endsWith("/compose"))
      return route.fulfill({
        json: {
          yaml: "services:\n  server:\n    image: nginx:alpine\n",
          version: 1,
        },
      });
    if (path.endsWith("/networking"))
      return route.fulfill({
        json: { version: 1, services: {}, pending: false },
      });
    if (path.endsWith("/services"))
      return route.fulfill({
        json: [{ name: "server", replicas: 1, ignoredPorts: false }],
      });
    if (path.endsWith("/status"))
      return route.fulfill({
        json: {
          dns: "ready",
          propagation: "ready",
          certificate: "ready",
          routing: "ready",
        },
      });
    if (path.endsWith("/sync")) {
      writes.push(path);
      return route.fulfill({ json: { queued: true } });
    }
    if (path.endsWith("/events") || path.endsWith("/logs"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: 'event: log\ndata: {"message":"Application is ready"}\n\nevent: status\ndata: {"state":"healthy"}\n\n',
      });
    if (path.startsWith("/api/v1/deployments/"))
      return route.fulfill({
        json: {
          phase: "",
          commit: "",
          error: "",
          releaseId: "",
          rollbackId: "",
          createdAt: "2026-10-19T00:00:00Z",
          updatedAt: "2026-10-19T00:00:00Z",
          id: path.split("/").at(-1),
          applicationId: "rustrack",
          state: "healthy",
        },
      });
    if (
      ["/metrics", "/releases", "/deployments"].some((suffix) =>
        path.endsWith(suffix),
      )
    )
      return route.fulfill({ json: [] });
    if (path.endsWith("/networks")) {
      inventories.push(path);
      if (failure)
        return route.fulfill({
          status: 502,
          json: { error: "SSH connection unavailable" },
        });
      return route.fulfill({
        json: path.includes("/test/")
          ? [
              {
                EnableIPv6: false,
                Containers: {},
                Id: "docker-ingress",
                Name: "sy-ingress",
                Driver: "bridge",
                Labels: { "shipyard.network": "ingress" },
                IPAM: { Config: [{ Subnet: "172.25.0.0/24" }] },
              },
              {
                EnableIPv6: false,
                Containers: {},
                Id: "docker-external",
                Name: "external-apps",
                Driver: "bridge",
                Labels: {},
                IPAM: { Config: [{ Subnet: "172.26.0.0/24" }] },
              },
              {
                EnableIPv6: false,
                Containers: {},
                Id: "docker-default",
                Name: "bridge",
                Driver: "bridge",
                Labels: {},
                IPAM: { Config: [] },
              },
              {
                EnableIPv6: false,
                Containers: {},
                Id: "docker-host",
                Name: "host",
                Driver: "host",
                Labels: {},
                IPAM: { Config: [] },
              },
            ]
          : [],
      });
    }
    throw new Error(`Unexpected ${request.method()} ${path}`);
  });
  return {
    writes,
    inventories,
    failInventory: (value: boolean) => {
      failure = value;
    },
  };
}

for (const theme of ["light", "dark"]) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("shipyard-theme", value),
        theme,
      );
    });
    test("application tabs have icons and compact spacing", async ({
      page,
    }, info) => {
      await setup(page);
      await page.goto("/applications/rustrack");
      const tabs = page.getByRole("tablist");
      const overview = tabs.getByRole("tab", { name: /^overview$/i });
      await expect(overview).toHaveAttribute("aria-selected", "true");
      for (const tab of await tabs.getByRole("tab").all()) {
        await expect(tab.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      }
      const panel = page.getByRole("tabpanel");
      const box = (await panel.boundingBox())!;
      const tabBox = (await tabs.boundingBox())!;
      expect(box.y - tabBox.y - tabBox.height).toBeGreaterThanOrEqual(4);
      expect(box.y - tabBox.y - tabBox.height).toBeLessThanOrEqual(12);
      await overview.focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        tabs.getByRole("tab", { name: /^compose$/i }),
      ).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("ArrowLeft");
      await expect(overview).toHaveAttribute("aria-selected", "true");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`tab-layout-${theme}.png`),
        fullPage: true,
      });
    });
    test("route controls and application tabs fit without a vertical scrollbar", async ({
      page,
    }, info) => {
      const state = await setup(page);
      await page.goto("/applications/rustrack?tab=domains");
      const panel = page.getByRole("tabpanel");
      await expect(
        panel.getByText("Domains and dedicated TCP listeners."),
      ).toHaveCount(0);
      const card = panel.locator('[data-slot="card"]');
      await expect(card.getByText("HTTPS", { exact: true })).toBeVisible();
      await expect(card.getByText("→ server:8080")).toBeVisible();
      const sync = card.getByRole("button", {
        name: "Retry sync",
        exact: true,
      });
      const edit = card.getByRole("button", {
        name: "Edit route",
        exact: true,
      });
      expect(
        Math.abs((await sync.boundingBox())!.y - (await edit.boundingBox())!.y),
      ).toBeLessThan(2);
      expect(await sync.innerText()).toBe("");
      expect(await edit.innerText()).toBe("");
      await sync.click();
      await expect.poll(() => state.writes.length).toBe(1);
      const tabs = page.getByRole("tablist");
      expect(
        await tabs.evaluate((node) => {
          const wrapper = node.parentElement!;
          return wrapper.scrollHeight <= wrapper.clientHeight;
        }),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`domains-${theme}.png`),
        fullPage: true,
      });
      if (info.project.name === "desktop") {
        const domain = await card
          .getByText("test.example.com", { exact: true })
          .boundingBox();
        const target = await card.getByText("→ server:8080").boundingBox();
        expect(
          Math.abs(
            domain!.y + domain!.height / 2 - target!.y - target!.height / 2,
          ),
        ).toBeLessThan(3);
      } else {
        await page.getByRole("tab", { name: /^terminal$/i }).focus();
        await expect(
          page.getByRole("tab", { name: /^terminal$/i }),
        ).toBeInViewport();
      }
    });

    test("Compose uses the available width and log headers are compact and readable", async ({
      page,
    }, info) => {
      await setup(page);
      await page.goto("/applications/rustrack?tab=compose");
      await expect(
        page.getByRole("textbox", { name: "Compose YAML", exact: true }),
      ).toBeVisible();
      const panel = page.getByRole("tabpanel"),
        card = panel.locator('[data-slot="card"]').first();
      expect(
        Math.abs(
          (await card.boundingBox())!.width -
            (await panel.boundingBox())!.width,
        ),
      ).toBeLessThan(3);
      await page.screenshot({
        path: info.outputPath(`compose-${theme}.png`),
        fullPage: true,
      });
      for (const url of [
        "?tab=logs",
        "?tab=deployments&deployment=2bdec53b-1234",
      ]) {
        await page.goto(`/applications/rustrack${url}`);
        const title = page.getByText(
          url.includes("deployment=") ? "Deployment 2bdec53b" : "Runtime logs",
          { exact: true },
        );
        await expect(title).toBeVisible();
        const header = title.locator("..");
        expect((await header.boundingBox())!.height).toBeLessThanOrEqual(64);
        expect(
          await title.evaluate((node) =>
            parseFloat(getComputedStyle(node).fontSize),
          ),
        ).toBeGreaterThanOrEqual(14);
        expect(
          await title.evaluate((node) =>
            parseFloat(getComputedStyle(node).fontWeight),
          ),
        ).toBeGreaterThanOrEqual(600);
        await page.screenshot({
          path: info.outputPath(
            `${url.includes("deployment=") ? "deployment" : "runtime"}-${theme}.png`,
          ),
          fullPage: true,
        });
      }
    });

    test("Variables and Networking fill the application content width", async ({
      page,
    }, info) => {
      await setup(page);
      for (const tab of ["variables", "networking"]) {
        await page.goto(`/applications/rustrack?tab=${tab}`);
        const panel = page.getByRole("tabpanel");
        if (tab === "networking")
          await expect(panel.getByLabel("Container hostname")).toBeVisible();
        else
          await expect(
            panel.getByLabel("Value", { exact: true }),
          ).toBeVisible();
        const cards = panel.locator('[data-slot="card"]');
        for (const card of await cards.all())
          expect(
            Math.abs(
              (await card.boundingBox())!.width -
                (await panel.boundingBox())!.width,
            ),
          ).toBeLessThan(3);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${tab}-${theme}.png`),
          fullPage: true,
        });
      }
    });

    test("server selection shows ingress and live Docker inventory without duplicating managed networks", async ({
      page,
    }, info) => {
      await setup(page);
      await page.goto("/networks");
      await expect(
        page.getByRole("cell", { name: /Application ingress/ }),
      ).toBeVisible();
      const filter = page.getByRole("combobox", {
        name: "Server",
        exact: true,
      });
      expect((await filter.boundingBox())!.width).toBeGreaterThan(240);
      await filter.click();
      await page.getByRole("option", { name: "test", exact: true }).click();
      expect(
        await filter.evaluate(
          (node) =>
            node
              .querySelector('[data-slot="select-value"]')!
              .getBoundingClientRect().left - node.getBoundingClientRect().left,
        ),
      ).toBeLessThan(48);
      await expect(
        page.getByRole("row").filter({ hasText: "external-apps" }),
      ).toBeVisible();
      const ingress = page
        .getByRole("row")
        .filter({ hasText: "Application ingress" });
      await expect(ingress).toHaveCount(1);
      await expect(ingress.getByRole("button")).toHaveCount(0);
      await expect(
        page.getByRole("row").filter({ hasText: "shared" }),
      ).toHaveCount(0);
      const builtin = page
        .getByRole("row")
        .filter({ hasText: "Docker built-in" });
      await expect(builtin).toHaveCount(2);
      await expect(builtin.getByRole("link")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`networks-${theme}.png`),
        fullPage: true,
      });
      await page.getByRole("link", { name: "Register", exact: true }).click();
      await expect(
        page.getByRole("combobox", { name: "Network server" }),
      ).toHaveText("test");
      await expect(
        page.getByRole("combobox", { name: "Existing bridge" }),
      ).toHaveText("external-apps");
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
        "external-apps",
      );
    });
  });
}

test("network inventory errors are retryable and changing servers clears old inventory", async ({
  page,
}) => {
  const state = await setup(page);
  state.failInventory(true);
  await page.goto("/networks");
  await page.getByRole("combobox", { name: "Server", exact: true }).click();
  await page.getByRole("option", { name: "test", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "SSH connection unavailable",
  );
  await expect(
    page.getByRole("row").filter({ hasText: "Application ingress" }),
  ).toBeVisible();
  state.failInventory(false);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "external-apps" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Server", exact: true }).click();
  await page.getByRole("option", { name: "other", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "shared" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "external-apps" }),
  ).toHaveCount(0);
});

test("viewers cannot sync routes or request administrator network inventory", async ({
  page,
}) => {
  const state = await setup(page, { admin: false, writable: false });
  await page.goto("/applications/rustrack?tab=domains");
  await expect(
    page.getByRole("button", { name: "Retry sync", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit route", exact: true }),
  ).toBeDisabled();
  await page.goto("/networks");
  await page.getByRole("combobox", { name: "Server", exact: true }).click();
  await page.getByRole("option", { name: "test", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Application ingress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add network", exact: true }),
  ).toBeDisabled();
  expect(state.inventories).toHaveLength(0);
});
