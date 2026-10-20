import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

async function setup(page: Page, { writable = true, stopped = false } = {}) {
  const resource = (id: string, kind: string, parentId = "", data = {}) => ({
    variables: {},
    createdAt: "2026-10-19T00:00:00Z",
    updatedAt: "2026-10-19T00:00:00Z",
    id,
    kind,
    parentId,
    name: id === "app" ? "Example app" : id,
    teamId: "team",
    data,
    version: 7,
    secretKeys: [],
    canWrite: writable,
  });
  let resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("environment", "environment", "project"),
    resource("host", "server"),
    resource("app", "application", "environment", {
      source: "compose",
      engine: "compose",
      serverId: "host",
    }),
  ];
  const deployment = (id: string, state = "healthy") => ({
    id,
    applicationId: "app",
    state,
    phase: "complete",
    commit: "compose:abc",
    error: "",
    releaseId: state === "healthy" ? id : "",
    rollbackId: "",
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
    deleting: false,
    deletionError: "",
  });
  let deployments = [
    deployment("active"),
    deployment("old"),
    deployment("pending", "building"),
  ];
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  let fail = false;
  let runtimeStatus = stopped ? "stopped" : "running";
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/telemetry") return route.fulfill({ json: { dsn: "" } });
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          user: {
            email: "user@example.test",
            totp: false,
            id: "user",
            name: "Operator",
            admin: false,
          },
          csrf: "csrf",
        },
      });
    if (path === "/resources") return route.fulfill({ json: resources });
    if (path === "/applications/app/runtime")
      return route.fulfill({
        json: {
          status: runtimeStatus,
          releaseId: "active",
          containers: ["container"],
        },
      });
    if (path === "/deployments") return route.fulfill({ json: deployments });
    if (path === "/applications/app/releases")
      return route.fulfill({
        json: deployments
          .filter((d) => d.state === "healthy" && !d.deleting)
          .map((d) => ({ id: d.id, commit: d.commit, createdAt: d.createdAt })),
      });
    if (path.endsWith("/metrics")) return route.fulfill({ json: [] });
    if (path.endsWith("/events"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: 'event: log\ndata: {"message":"Deployment log"}\n\nevent: status\ndata: {"state":"healthy"}\n\n',
      });
    if (request.method() === "GET" && path.startsWith("/deployments/")) {
      const found = deployments.find((d) => d.id === path.split("/").at(-1));
      return found
        ? route.fulfill({ json: found })
        : route.fulfill({
            status: 404,
            json: { error: "Deployment not found" },
          });
    }
    if (
      path === "/applications/app/deploy" ||
      path === "/applications/app/action" ||
      path === "/resources/app" ||
      path.startsWith("/deployments/")
    ) {
      const body = request.postDataJSON() || {};
      requests.push({ path, body });
      if (fail)
        return route.fulfill({
          status: 409,
          json: { error: "Operation could not be queued" },
        });
      if (path.endsWith("/deploy")) {
        deployments = [deployment("new", "queued"), ...deployments];
        return route.fulfill({ status: 202, json: { id: "new" } });
      }
      if (path.endsWith("/action"))
        runtimeStatus = body.action === "stop" ? "stopped" : "running";
      if (path.startsWith("/deployments/"))
        deployments = deployments.map((d) =>
          d.id === path.split("/").at(-1) ? { ...d, deleting: true } : d,
        );
      if (path === "/resources/app")
        resources = resources.filter((r) => r.id !== "app");
      return route.fulfill({ status: 202, json: { jobId: "job" } });
    }
    throw new Error(`Unexpected ${request.method()} ${path}`);
  });
  return {
    requests,
    setFailure: (value: boolean) => {
      fail = value;
    },
    completeDeletion: () => {
      deployments = deployments.filter((d) => !d.deleting);
    },
    failDeletion: () => {
      deployments = deployments.map((d) =>
        d.deleting ? { ...d, deletionError: "Cleanup needs attention" } : d,
      );
    },
  };
}

for (const theme of ["light", "dark"]) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("shipyard-theme:v1", value),
        theme,
      );
    });

    test("split button opens accessible actions and keeps Deploy primary", async ({
      page,
    }) => {
      const state = await setup(page);
      await page.goto("/applications/app");
      const group = page.getByRole("group", { name: "Deployment actions" });
      await expect(
        group.getByRole("button", { name: "Deploy", exact: true }),
      ).toBeVisible();
      const trigger = group.getByRole("button", {
        name: "Application actions",
      });
      await trigger.focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(page.getByRole("menuitem")).toHaveText([
        "Fresh deploy",
        "Restart",
        "Stop",
        "Delete application",
      ]);
      await page.screenshot({
        path: test.info().outputPath("actions-menu.png"),
      });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(
        page.getByRole("button", { name: "Configure", exact: true }),
      ).toBeVisible();
      await group.getByRole("button", { name: "Deploy", exact: true }).click();
      await expect.poll(() => state.requests[0]?.body).toEqual({});
      await expect(page).toHaveURL(/deployment=new/);
    });

    test("Fresh deploy requires the exact name and sends confirmation and version", async ({
      page,
    }) => {
      const state = await setup(page);
      await page.goto("/applications/app");
      await page.getByRole("button", { name: "Application actions" }).click();
      await page
        .getByRole("menuitem", { name: "Fresh deploy", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("permanently erases");
      await expect(dialog).toContainText("application stays stopped");
      const confirm = dialog.getByRole("button", {
        name: "Fresh deploy",
        exact: true,
      });
      await expect(confirm).toBeDisabled();
      await dialog
        .getByLabel("Type Example app to confirm")
        .fill("example app");
      await expect(confirm).toBeDisabled();
      await dialog
        .getByLabel("Type Example app to confirm")
        .fill("Example app");
      state.setFailure(true);
      await confirm.click();
      await expect(dialog).toContainText("Operation could not be queued");
      state.setFailure(false);
      await confirm.click();
      await expect(dialog).not.toBeVisible();
      expect(state.requests.at(-1)?.body).toEqual({
        fresh: true,
        confirmName: "Example app",
        version: 7,
      });
    });

    test("Stop changes to Start and Delete application keeps its confirmation", async ({
      page,
    }) => {
      const state = await setup(page);
      await page.goto("/applications/app");
      await page.getByRole("button", { name: "Application actions" }).click();
      await page.getByRole("menuitem", { name: "Stop", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await page.getByRole("button", { name: "Application actions" }).click();
      await expect(
        page.getByRole("menuitem", { name: "Start", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("menuitem", { name: "Delete application", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(
        "Persistent volumes and bind-mounted data are preserved",
      );
      await expect(
        dialog.getByRole("button", { name: "Delete application", exact: true }),
      ).toBeDisabled();
      await dialog
        .getByLabel("Type Example app to confirm")
        .fill("Example app");
      await dialog
        .getByRole("button", { name: "Delete application", exact: true })
        .click();
      await expect
        .poll(() => state.requests.at(-1)?.path)
        .toBe("/resources/app");
    });

    test("deployment deletion protects active and running rows and clears removed logs", async ({
      page,
    }) => {
      const state = await setup(page);
      await page.goto("/applications/app?tab=deployments&deployment=old");
      const rows = page.getByRole("row");
      await expect(
        rows
          .nth(1)
          .getByRole("button", { name: "Delete deployment", exact: true }),
      ).toBeDisabled();
      await expect(
        rows
          .nth(3)
          .getByRole("button", { name: "Delete deployment", exact: true }),
      ).toBeDisabled();
      await rows
        .nth(2)
        .getByRole("button", { name: "Delete deployment", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("retained rollback release");
      state.setFailure(true);
      await dialog
        .getByRole("button", { name: "Delete deployment", exact: true })
        .click();
      await expect(dialog).toContainText("Operation could not be queued");
      state.setFailure(false);
      await dialog
        .getByRole("button", { name: "Delete deployment", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(rows.nth(2)).toContainText("Deleting…");
      state.failDeletion();
      await expect(
        page.getByRole("button", { name: "Retry deployment deletion" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Retry deployment deletion" })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete deployment", exact: true })
        .click();
      state.completeDeletion();
      await expect(page).not.toHaveURL(/deployment=old/);
      await expect(page.getByRole("row")).toHaveCount(3);
      await page.goto("/applications/app?tab=deployments&deployment=old");
      await expect(page).not.toHaveURL(/deployment=old/);
    });

    test("read-only users cannot deploy, open actions, or delete history", async ({
      page,
    }) => {
      await setup(page, { writable: false });
      await page.goto("/applications/app?tab=deployments");
      await expect(
        page.getByRole("button", { name: "Application actions" }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Deploy", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Delete deployment", exact: true }),
      ).toHaveCount(0);
    });
  });
}
