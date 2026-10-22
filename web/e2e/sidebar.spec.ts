import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

async function sidebarFixture(page: Page, version: string | null = "9.8.7") {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/version"))
      return version === null
        ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
        : route.fulfill({ json: { ...buildInfoFixture, version } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: {
            id: "user",
            name: "Viewer",
            email: "viewer@example.test",
            admin: false,
            totp: false,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources") || path.endsWith("/deployments"))
      return route.fulfill({ json: [] });
    throw new Error(`Unexpected sidebar request ${path}`);
  });
}

test("desktop icon rail persists while mobile navigation stays expanded", async ({
  page,
}, info) => {
  await sidebarFixture(page);
  if (info.project.name === "mobile") {
    await page.addInitScript(() =>
      localStorage.setItem("shipyard.sidebar.v1", "collapsed"),
    );
  }
  await page.goto("/projects");
  if (info.project.name === "mobile") {
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByText("SHIPYARD v9.8.7", { exact: true }),
    ).toBeVisible();
    await expect(
      drawer.getByRole("link", { name: "Projects", exact: false }),
    ).toHaveCSS("display", "flex");
    await page.screenshot({
      path: info.outputPath("sidebar-mobile.png"),
      animations: "disabled",
    });
    await drawer.getByRole("link", { name: "Projects", exact: false }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/projects$/);
    return;
  }
  const sidebar = page.locator("#desktop-sidebar");
  await expect(sidebar).toHaveCSS("width", "240px");
  const projects = sidebar.getByRole("link", {
    name: "Projects",
    exact: false,
  });
  await expect(projects).toHaveCSS("display", "flex");
  await expect(projects).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const expanded = await page.locator("main").boundingBox();
  await expect(
    sidebar.getByText("SHIPYARD v9.8.7", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "64px");
  await expect(projects).toHaveCSS("display", "flex");
  const linkBox = await projects.boundingBox();
  const iconBox = await projects.locator("svg").boundingBox();
  expect(linkBox?.height).toBeGreaterThanOrEqual(36);
  expect((iconBox?.x ?? 0) + (iconBox?.width ?? 0) / 2).toBeCloseTo(
    (linkBox?.x ?? 0) + (linkBox?.width ?? 0) / 2,
  );
  await page.screenshot({
    path: info.outputPath("sidebar-collapsed.png"),
    animations: "disabled",
  });
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toHaveAttribute("aria-expanded", "false");
  const collapsed = await page.locator("main").boundingBox();
  expect((expanded?.x ?? 0) - (collapsed?.x ?? 0)).toBe(176);
  await sidebar.getByRole("link", { name: "Projects", exact: true }).hover();
  await expect(
    page.getByRole("tooltip", { name: "Projects", exact: true }),
  ).toBeVisible();
  await sidebar.getByRole("button", { name: "SHIPYARD v9.8.7" }).focus();
  await expect(
    page.getByRole("tooltip", { name: "SHIPYARD v9.8.7" }),
  ).toBeVisible();
  await sidebar.getByRole("link", { name: "Deployments", exact: true }).click();
  await expect(page).toHaveURL(/\/deployments$/);
  await expect(
    sidebar.getByRole("link", { name: "Deployments", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "64px");
  await page.getByRole("button", { name: "Expand sidebar" }).focus();
  await page.keyboard.press("Enter");
  await expect(sidebar).toHaveCSS("width", "240px");
});

for (const version of ["dev", null]) {
  test(`sidebar reports ${version ?? "unavailable"} backend version honestly`, async ({
    page,
  }, info) => {
    await sidebarFixture(page, version);
    await page.goto("/projects");
    if (info.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    const sidebar =
      info.project.name === "mobile"
        ? page.getByRole("dialog")
        : page.locator("#desktop-sidebar");
    await expect(
      sidebar.getByText(version === "dev" ? "SHIPYARD dev" : "SHIPYARD", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      sidebar.getByText("SHIPYARD v0.1", { exact: true }),
    ).toHaveCount(0);
  });
}
