import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=";

async function setup(page: Page, writable = true) {
  function resource(
    id: string,
    kind: string,
    parentId = "",
    sortOrder = 1,
    data = {},
    logoUrl: string | null = null,
  ) {
    return {
      id,
      kind,
      parentId,
      sortOrder,
      data,
      name: id,
      teamId: "team",
      version: 1,
      secretKeys: [],
      variables: {},
      canWrite: writable,
      createdAt: "2026-10-30T00:00:00Z",
      updatedAt: "2026-10-30T00:00:00Z",
      logoUrl,
    };
  }
  let resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("second", "project", "team", 2),
    resource("environment", "environment", "project"),
    resource("server", "server"),
    resource("app", "application", "environment", 1, {
      source: "compose",
      engine: "compose",
      serverId: "server",
      healthTimeout: 120,
    }),
    resource("database", "application", "environment", 2, {
      source: "compose",
      engine: "compose",
      serverId: "server",
      healthTimeout: 120,
    }),
  ];
  const moves: string[] = [];
  const connections: string[] = [];
  let containers = ["a".repeat(64), "b".repeat(64)];
  let revision = 0;
  await page.routeWebSocket(
    "**/api/v1/applications/app/terminal?*",
    (socket) => {
      connections.push(socket.url());
    },
  );
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/version"))
      return route.fulfill({ json: buildInfoFixture });
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: {
            id: "user",
            name: "Operator",
            email: "operator@test.invalid",
            admin: true,
            totp: false,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources")) return route.fulfill({ json: resources });
    const match = path.match(/\/resources\/([^/]+)\/(logo|move)$/u);
    if (match) {
      const [, id, action] = match;
      const item = resources.find((row) => row.id === id);
      if (!item)
        return route.fulfill({ status: 404, json: { error: "Not found" } });
      if (action === "logo" && request.method() === "GET")
        return route.fulfill({
          contentType: "image/png",
          body: Buffer.from(png, "base64"),
        });
      if (!writable)
        return route.fulfill({ status: 403, json: { error: "Read only" } });
      if (action === "logo") {
        revision++;
        item.logoUrl =
          request.method() === "DELETE"
            ? null
            : `/api/v1/resources/${id}/logo?v=${revision}`;
        return route.fulfill({ json: item });
      }
      const body = request.postDataJSON();
      moves.push(id);
      const scope = resources
        .filter(
          (row) =>
            row.kind === item.kind &&
            (row.kind === "project" || row.parentId === item.parentId),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((row) => row.id !== id);
      const index =
        body.beforeId === null
          ? scope.length
          : scope.findIndex((row) => row.id === body.beforeId);
      scope.splice(index, 0, item);
      scope.forEach((row, position) => {
        row.sortOrder = position + 1;
      });
      resources = [...resources];
      return route.fulfill({ json: resources });
    }
    if (path.endsWith("/runtime"))
      return route.fulfill({
        json: {
          status: "running",
          containers,
          containerDetails: containers.map((id, index) => ({
            id,
            service: "web",
            replica: index + 1,
            name: `stack-web-${index + 1}`,
          })),
        },
      });
    if (path.endsWith("/compose"))
      return route.fulfill({
        json: {
          yaml: "services:\n  web:\n    image: nginx:alpine\n",
          version: 1,
        },
      });
    return route.fulfill({ json: [] });
  });
  function replaceContainers() {
    containers = ["c".repeat(64)];
  }
  return { moves, connections, replaceContainers, resources };
}

test("uploads, replaces and removes project and application logos", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/projects");
  await page
    .locator('[data-card-id="project"]')
    .getByRole("button", { name: "Project actions" })
    .click();
  await page.getByRole("menuitem", { name: "Edit project" }).click();
  await page.getByLabel("Logo image").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Replace logo" }),
  ).toBeVisible();
  await page.getByLabel("Logo image").setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator('img[src$="v=2"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByRole("button", { name: "Upload logo" })).toBeVisible();
  await page.goto("/configure/application/app");
  await page.getByLabel("Logo image").setInputFiles({
    name: "app.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Replace logo" }),
  ).toBeVisible();
  await page.goto("/projects/project");
  await expect(page.locator('[data-card-id="app"] img')).toBeVisible();
});

test("reorders project and app cards with keyboard and persists after reload", async ({
  page,
}, info) => {
  const { moves } = await setup(page);
  await page.goto("/projects");
  await page.getByRole("button", { name: "Reorder second" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press(
    info.project.name === "mobile" ? "ArrowUp" : "ArrowLeft",
  );
  await page.keyboard.press("Space");
  await expect.poll(() => moves.length).toBe(1);
  await expect(page.locator("[data-card-id]").first()).toHaveAttribute(
    "data-card-id",
    "second",
  );
  await page.reload();
  await expect(page.locator("[data-card-id]").first()).toHaveAttribute(
    "data-card-id",
    "second",
  );
  await page.goto("/projects/project");
  await page.getByRole("button", { name: "Reorder database" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press(
    info.project.name === "mobile" ? "ArrowUp" : "ArrowLeft",
  );
  await page.keyboard.press("Space");
  await expect.poll(() => moves.length).toBe(2);
  await expect(page.locator("[data-card-id]").first()).toHaveAttribute(
    "data-card-id",
    "database",
  );
});

test("reorders cards by dragging their dedicated handle", async ({ page }) => {
  const { moves } = await setup(page);
  await page.goto("/projects");
  const source = await page
    .getByRole("button", { name: "Reorder second" })
    .boundingBox();
  const target = await page.locator('[data-card-id="project"]').boundingBox();
  if (!source || !target) throw new Error("Cards were not rendered");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2 + 12,
    source.y + source.height / 2,
    { steps: 4 },
  );
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 20 },
  );
  await page.mouse.up();
  await expect.poll(() => moves.length).toBe(1);
  await expect(page.locator("[data-card-id]").first()).toHaveAttribute(
    "data-card-id",
    "second",
  );
});

test("hides reorder handles for readers", async ({ page }) => {
  await setup(page, false);
  await page.goto("/projects");
  await expect(
    page.getByRole("link", { name: "project", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reorder /u })).toHaveCount(0);
});

test("disables reordering while filtering", async ({ page }) => {
  await setup(page);
  await page.goto("/projects");
  await page.getByPlaceholder("Filter by name…").fill("project");
  await expect(
    page.getByRole("button", { name: "Reorder project", exact: true }),
  ).toBeDisabled();
  await page.getByPlaceholder("Filter by name…").fill("");
  await expect(
    page.getByRole("button", { name: "Reorder project", exact: true }),
  ).toBeEnabled();
});

test("allows moving a writable card around a read-only card", async ({
  page,
}, info) => {
  const { resources, moves } = await setup(page);
  const readonly = resources.find((resource) => resource.id === "project");
  if (!readonly) throw new Error("Project fixture is missing");
  readonly.canWrite = false;
  await page.goto("/projects");
  await expect(
    page.getByRole("button", { name: "Reorder project", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reorder second" }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press(
    info.project.name === "mobile" ? "ArrowUp" : "ArrowLeft",
  );
  await page.keyboard.press("Space");
  await expect.poll(() => moves.length).toBe(1);
  await expect(page.locator("[data-card-id]").first()).toHaveAttribute(
    "data-card-id",
    "second",
  );
});

test("shows services and replicas and keeps terminal connections scoped to full IDs", async ({
  page,
}) => {
  const { connections, replaceContainers } = await setup(page);
  await page.goto("/applications/app?tab=terminal");
  await page.getByRole("combobox", { name: "Container", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "web (1)", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "web (2)", exact: true }).click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect.poll(() => connections.length).toBe(1);
  expect(new URL(connections[0]).searchParams.get("container")).toBe(
    "b".repeat(64),
  );
  replaceContainers();
  await expect(
    page.getByRole("combobox", { name: "Container", exact: true }),
  ).toHaveText("web");
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeVisible();
  expect(connections).toHaveLength(1);
});
