import type { Page } from "@playwright/test";

import { test, expect } from "@playwright/test";
async function setup(
  page: Page,
  { admin = true, enabled = true, acmeConfigured = true } = {},
) {
  const state = {
    version: 1,
    enabled,
    acmeConfigured,
    origin: "https://panel.example.com",
    domain: "panel.example.com",
    candidateOrigin: "https://panel.example.com",
    activeDomain: "panel.example.com",
    status: {
      dns: "manual",
      propagation: "ready",
      certificate: "ready",
      routing: "ready",
    },
    error: "",
  };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let fail = false;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: { user: { id: "admin", name: "Admin", admin }, csrf: "csrf" },
      });
    if (path.endsWith("/resources") || path.endsWith("/metrics"))
      return route.fulfill({ json: [] });
    if (path.includes("/settings/dashboard-access")) {
      if (req.method() === "GET") return route.fulfill({ json: state });
      writes.push({ path, body: req.postDataJSON() });
      if (fail)
        return route.fulfill({
          status: 502,
          json: { error: "Certificate issuance unavailable" },
        });
      Object.assign(state, {
        version: state.version + 1,
        domain: req.postDataJSON().domain || state.domain,
      });
      return route.fulfill({ status: 202, json: { jobId: "job" } });
    }
    throw Error("Unexpected API " + path);
  });
  return {
    state,
    writes,
    fail: () => {
      fail = true;
    },
  };
}
test("a successful hostname save clears navigation protection", async ({
  page,
}) => {
  const data = await setup(page);
  await page.goto("/settings?tab=dashboard");
  await page.getByLabel("Dashboard hostname").fill("new.example.com");
  await page.getByRole("button", { name: "Save hostname" }).click();
  await expect.poll(() => data.writes.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Save hostname" }),
  ).toBeEnabled();
  await page
    .getByRole("tab", { name: "Account security", exact: true })
    .click();
  await expect(page).toHaveURL(/tab=security/);
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (t) => localStorage.setItem("shipyard-theme", t),
        theme,
      );
    });
    test("hostname configuration uses manual DNS and HTTP validation", async ({
      page,
    }, info) => {
      const data = await setup(page);
      await page.goto("/settings?tab=dashboard");
      await expect(
        page.getByText("DNS is managed manually for this hostname.", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(page.getByRole("combobox")).toHaveCount(0);
      await page.getByLabel("Dashboard hostname").fill("new.example.com");
      await page.getByRole("button", { name: "Save hostname" }).click();
      expect(data.writes[0].body).toEqual({
        version: 1,
        domain: "new.example.com",
      });
      await expect(
        page.getByRole("button", { name: /Confirm HTTPS/ }),
      ).toHaveCount(0);
      data.fail();
      await page.getByRole("button", { name: "Retry setup" }).click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Certificate issuance unavailable" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("dashboard-" + theme + ".png"),
        fullPage: true,
      });
    });
    test("CA terms are explicit and contact email is optional", async ({
      page,
    }) => {
      const data = await setup(page, { acmeConfigured: false });
      await page.goto("/settings?tab=dashboard");
      await expect(
        page.getByRole("button", { name: "Save hostname" }),
      ).toBeDisabled();
      await page
        .getByRole("switch", {
          name: "I accept the Let's Encrypt terms of service",
        })
        .click();
      await page.getByRole("button", { name: "Save hostname" }).click();
      expect(data.writes[0].body).toMatchObject({
        acmeEmail: "",
        acceptTos: true,
      });
    });
    test("development and viewer boundaries", async ({ page }) => {
      await setup(page, { enabled: false });
      await page.goto("/settings?tab=dashboard");
      await expect(
        page.getByText(
          /This development installation keeps its configured origin/,
        ),
      ).toBeVisible();
      await expect(page.getByLabel("Dashboard hostname")).toHaveCount(0);
    });
  });
}
