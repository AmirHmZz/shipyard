import { expect, test, type Page } from "@playwright/test";

async function setup(page: Page, writable = true) {
  const resource = (id: string, kind: string, parentId = "", data = {}) => ({
    id,
    kind,
    name: id,
    parentId,
    teamId: "team",
    data,
    version: 1,
    canWrite: writable,
  });
  const resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("environment", "environment", "project"),
    resource("server", "server"),
    resource("zone", "zone", "dns", { domain: "example.com" }),
    resource("app", "application", "environment", {
      source: "git",
      engine: "dockerfile",
      serverId: "server",
      port: 8080,
    }),
  ];
  const deletes: string[] = [];
  const writes: any[] = [];
  let fail = false;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: { id: "user", name: "Operator", admin: true },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources")) {
      if (request.method() !== "GET") {
        writes.push(request.postDataJSON());
        return route.fulfill({
          json: resource("route", "route", "app", request.postDataJSON().data),
        });
      }
      return route.fulfill({ json: resources });
    }
    if (
      path.startsWith("/api/v1/resources/") &&
      request.method() === "DELETE"
    ) {
      if (fail)
        return route.fulfill({
          status: 409,
          json: { error: "A conflicting cleanup is already running" },
        });
      deletes.push(path);
      const root = path.split("/").at(-1)!;
      for (const r of resources)
        if (
          r.id === root ||
          (root === "project" && ["environment", "app"].includes(r.id))
        ) {
          r.data = { ...r.data, deleting: true, deletionRoot: root };
        }
      return route.fulfill({
        status: 202,
        json: { ok: true, jobId: "deletion" },
      });
    }
    if (path.endsWith("/services"))
      return route.fulfill({
        json: [{ name: "app", replicas: 1, ignoredPorts: false }],
      });
    if (path.endsWith("/runtime"))
      return route.fulfill({ json: { status: "stopped" } });
    if (path.endsWith("/events"))
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (
      ["/metrics", "/deployments", "/releases"].some((suffix) =>
        path.endsWith(suffix),
      )
    )
      return route.fulfill({ json: [] });
    throw new Error(`Unexpected ${request.method()} ${path}`);
  });
  return {
    deletes,
    writes,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}

test("project card deletion requires the exact name, supports cancellation and shows pending cleanup", async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.goto("/projects");
  await page.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menuitem", { name: "Delete project" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Delete project?",
    exact: true,
  });
  const confirm = dialog.getByRole("button", {
    name: "Delete project",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type project to confirm").fill("Project");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(state.deletes).toHaveLength(0);
  await page.getByRole("button", { name: "Project actions" }).click();
  await page.getByRole("menuitem", { name: "Delete project" }).click();
  await dialog.getByLabel("Type project to confirm").fill("project");
  await page.screenshot({ path: info.outputPath("delete-project-light.png") });
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  expect(state.deletes).toEqual(["/api/v1/resources/project"]);
  await expect(page.getByText("Deleting…", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "project", exact: true }).click();
  await expect(page.getByText(/Deletion in progress/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Application", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("application deletion keeps error context, retries and returns to the parent project", async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.goto("/applications/app");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.getByRole("button", { name: "Application actions" }).click();
  await page
    .getByRole("menuitem", { name: "Delete application", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Delete application?",
    exact: true,
  });
  await expect(
    dialog.getByText(/Persistent volumes and bind-mounted data are preserved/),
  ).toBeVisible();
  await dialog.getByLabel("Type app to confirm").fill("app");
  state.fail(true);
  await dialog
    .getByRole("button", { name: "Delete application", exact: true })
    .click();
  await expect(
    dialog.getByText("A conflicting cleanup is already running"),
  ).toBeVisible();
  await expect(dialog.getByLabel("Type app to confirm")).toHaveValue("app");
  await page.screenshot({
    path: info.outputPath("delete-application-dark.png"),
  });
  state.fail(false);
  await dialog
    .getByRole("button", { name: "Delete application", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/project$/);
  expect(state.deletes).toEqual(["/api/v1/resources/app"]);
});

test("viewers cannot delete projects or applications", async ({ page }) => {
  await setup(page, false);
  await page.goto("/projects");
  await page.getByRole("button", { name: "Project actions" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Delete project" }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await page.goto("/applications/app");
  await expect(
    page.getByRole("button", { name: "Application actions", exact: true }),
  ).toBeDisabled();
});

test("container ports use themed steppers and preserve typing, keyboard steps and saved values", async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.goto("/applications/app");
  await page.getByRole("tab", { name: "domains", exact: true }).click();
  await page.getByRole("button", { name: "Add route", exact: true }).click();
  const dialog = page.getByRole("main");
  const port = dialog.getByLabel("Container port", { exact: true });
  const control = port.locator("..");
  await port.fill("8080");
  await control.getByRole("button", { name: "Increase value" }).click();
  await expect(port).toHaveValue("8081");
  await control.getByRole("button", { name: "Decrease value" }).click();
  await expect(port).toHaveValue("8080");
  await port.press("ArrowUp");
  await expect(port).toHaveValue("8081");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Select connected zone" }).click();
  await page.getByRole("option", { name: "example.com", exact: true }).click();
  await dialog.getByLabel("Subdomain", { exact: true }).fill("app");
  await port.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("number-controls-light.png") });
  await dialog.getByRole("button", { name: "Save route" }).click();
  await expect(page).toHaveURL(/applications\/app(?:\?tab=domains)?$/);
  await page.getByRole("tab", { name: "domains", exact: true }).click();
  expect(state.writes[0].data.targetPort).toBe(8081);
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.getByRole("button", { name: "Add route", exact: true }).click();
  await page
    .getByLabel("Container port", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("number-controls-dark.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("number steppers respect lower and upper bounds", async ({ page }) => {
  await setup(page);
  let policy = {
    cpu: 99,
    memory: 90,
    disk: 90,
    sustainedSeconds: 60,
    offlineSeconds: 60,
  };
  await page.route("**/api/v1/settings/alerts", async (route) => {
    if (route.request().method() === "PUT")
      policy = route.request().postDataJSON();
    return route.fulfill({ json: policy });
  });
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Alerts", exact: true }).click();
  const cpu = page.getByLabel("CPU threshold (%)", { exact: true });
  const control = cpu.locator("..");
  await control.getByRole("button", { name: "Increase value" }).click();
  await expect(cpu).toHaveValue("100");
  await expect(
    control.getByRole("button", { name: "Increase value" }),
  ).toBeDisabled();
  await cpu.fill("1");
  await expect(
    control.getByRole("button", { name: "Decrease value" }),
  ).toBeDisabled();
  await control.getByRole("button", { name: "Increase value" }).click();
  await expect(cpu).toHaveValue("2");
  await page.getByRole("button", { name: "Save alert policy" }).click();
  await expect.poll(() => policy.cpu).toBe(2);
});
