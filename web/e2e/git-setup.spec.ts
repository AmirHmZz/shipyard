import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

type TeamFixture = { id: string; name: string; canWrite: boolean };

async function setup(
  page: Page,
  existing = false,
  admin = true,
  teams: TeamFixture[] = [],
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const instance = {
    id: "instance",
    name: "Gitea instance",
    url: "https://git.example.com",
    clientId: "client",
    configured: true,
  };
  let secretConfigured = false;
  let configuredInstances = existing || teams.length ? [instance] : [];
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
            email: "user@example.test",
            totp: false,
            id: "admin",
            name: "Administrator",
            admin,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources"))
      return route.fulfill({
        json: [
          ...teams.map((team) => ({
            ...team,
            kind: "team",
            parentId: "",
            teamId: team.id,
            data: {},
            variables: {},
            secretKeys: [],
            createdAt: "2026-10-19T00:00:00Z",
            updatedAt: "2026-10-19T00:00:00Z",
            version: 1,
          })),
          ...(existing
            ? [
                {
                  parentId: teams[0]?.id || "",
                  teamId: teams[0]?.id || "",
                  variables: {},
                  createdAt: "2026-10-19T00:00:00Z",
                  updatedAt: "2026-10-19T00:00:00Z",
                  id: "git",
                  kind: "git",
                  name: "Team code",
                  data: {
                    provider: "gitea",
                    url: instance.url,
                    instanceId: "instance",
                    authMethod: "oauth",
                    status: "ready",
                  },
                  canWrite: admin || !!teams[0]?.canWrite,
                  secretKeys: ["oauth_token"],
                  version: 1,
                },
              ]
            : []),
        ],
      });
    if (path.endsWith("/git/setup/config"))
      return route.fulfill({
        json: {
          origin: "https://shipyard.test",
          giteaCallback:
            "https://shipyard.test/api/v1/git/setup/gitea/callback",
        },
      });
    if (path.endsWith("/git/gitea/instances")) {
      if (request.method() === "GET")
        return route.fulfill({ json: configuredInstances });
      configuredInstances = [instance];
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: instance });
    }
    if (path.endsWith("/setup"))
      return route.fulfill({
        json: {
          state: "ready",
          account: "code-owner",
          webhookUrl: "https://shipyard.test/api/v1/hooks/git",
          signingSecretConfigured: secretConfigured,
          lastDelivery: null,
        },
      });
    if (path.endsWith("/webhook-secret")) {
      secretConfigured = true;
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: { secret: "copy-this-once" } });
    }
    if (path.endsWith("/reconnect") || path.endsWith("/git/setup/start")) {
      writes.push({ path, body: request.postDataJSON() });
      return route.fulfill({
        status: 400,
        json: { error: "Authorization cancelled; try again." },
      });
    }
    throw new Error(`Unexpected API ${path}`);
  });
  await page.goto("/integrations");
  return writes;
}

test("guided setup uses provider logos, one-time instance credentials and useful errors", async ({
  page,
}, info) => {
  const writes = await setup(page);
  await page
    .getByRole("region", { name: "Source control", exact: true })
    .getByRole("button", { name: "Add connection" })
    .click();
  const dialog = page.getByRole("main");
  await expect(
    dialog.getByLabel("Provider", { exact: true }).locator("img"),
  ).toHaveAttribute("src", "/brands/github.svg");
  await expect(dialog.getByLabel("GitHub App ID")).toHaveCount(0);
  await dialog.getByLabel("Connection name").fill("My code");
  await dialog.getByLabel("Organization (optional)").fill("my-org");
  await dialog.getByRole("button", { name: "Create GitHub App" }).click();
  await expect(
    dialog.getByText("Authorization cancelled; try again.", { exact: true }),
  ).toBeVisible();
  expect(writes[0].body).toMatchObject({
    provider: "github",
    name: "My code",
    owner: "my-org",
  });
  await dialog.getByLabel("Provider", { exact: true }).click();
  await page.getByRole("option", { name: "Gitea", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Add instance", exact: true })
    .click();
  await expect(
    dialog.getByText("https://shipyard.test/api/v1/git/setup/gitea/callback", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog
    .getByLabel("Instance name", { exact: true })
    .fill("Gitea instance");
  await dialog
    .getByLabel("Instance URL", { exact: true })
    .fill("https://git.example.com");
  await dialog.getByLabel("Client ID", { exact: true }).fill("client");
  await dialog
    .getByLabel("Client secret", { exact: true })
    .fill("private-client-secret");
  await expect(
    dialog.getByLabel("Client secret", { exact: true }),
  ).toHaveAttribute("type", "password");
  await page.screenshot({
    path: info.outputPath("gitea-setup-light.png"),
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "Save instance", exact: true })
    .click();
  await expect(dialog.getByLabel("Client secret", { exact: true })).toHaveCount(
    0,
  );
  await dialog
    .getByRole("button", { name: "Authorize Gitea", exact: true })
    .click();
  await expect(
    dialog.getByText("Authorization cancelled; try again.", { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1)?.body).toMatchObject({
    provider: "gitea",
    instanceId: "instance",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("Gitea webhook secrets are shown once and reconnection stays manual for webhooks", async ({
  page,
}, info) => {
  const writes = await setup(page, true);
  await page
    .getByRole("region", { name: "Source control", exact: true })
    .getByRole("button", { name: "Configure", exact: true })
    .click();
  const dialog = page.getByRole("main");
  await expect(
    dialog.getByRole("heading", { name: "Manual webhook setup", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/Last accepted delivery: None received/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Generate signing secret", exact: true })
    .click();
  await expect(
    dialog.getByText("copy-this-once", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Reconnect", exact: true }).click();
  expect(writes.at(-1)?.path).toContain("/reconnect");
  await dialog
    .locator('[data-slot="button"]')
    .filter({ hasText: /^Close$/ })
    .click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page
    .getByRole("region", { name: "Source control", exact: true })
    .getByRole("button", { name: "Configure", exact: true })
    .click();
  await expect(dialog.getByText("copy-this-once", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByRole("button", { name: "Replace signing secret", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("gitea-webhook-dark.png"),
    animations: "disabled",
  });
  const styles = await dialog.evaluate((el) => ({
    width: getComputedStyle(el).scrollbarWidth,
    color: getComputedStyle(el).scrollbarColor,
  }));
  expect(styles.width).toBe("thin");
  expect(styles.color).not.toBe("auto");
});

test("operators can see their team connection but cannot manage it", async ({
  page,
}) => {
  await setup(page, true, false, [
    { id: "team", name: "Delivery", canWrite: false },
  ]);
  const source = page.getByRole("region", {
    name: "Source control",
    exact: true,
  });
  await expect(source.getByText("Gitea · Delivery")).toBeVisible();
  await expect(
    source.getByRole("button", { name: "Add connection", exact: true }),
  ).toBeDisabled();
  await expect(
    source.getByRole("button", { name: "Configure", exact: true }),
  ).toBeDisabled();
  await expect(
    source.getByRole("button", { name: "Delete", exact: true }),
  ).toBeDisabled();
  await page.goto("/configure/source-control/git");
  await expect(
    page.getByText(
      "Team owner access is required to configure this Git connection.",
    ),
  ).toBeVisible();
});

test("team owners can authorize a registered Gitea instance for their team", async ({
  page,
}) => {
  const writes = await setup(page, true, false, [
    { id: "team", name: "Delivery", canWrite: true },
    { id: "other-team", name: "Operations", canWrite: false },
  ]);
  const source = page.getByRole("region", {
    name: "Source control",
    exact: true,
  });
  await expect(
    source.getByRole("button", { name: "Team access", exact: true }),
  ).toHaveCount(0);
  await expect(
    source.getByRole("button", { name: "Delete", exact: true }),
  ).toBeEnabled();
  await source
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  const dialog = page.getByRole("main");
  await expect(dialog.getByLabel("Team access", { exact: true })).toHaveText(
    "Delivery",
  );
  await dialog.getByLabel("Team access", { exact: true }).click();
  await expect(page.getByRole("option", { name: "Operations" })).toHaveCount(0);
  await page.getByRole("option", { name: "Delivery" }).click();
  await expect(
    dialog.getByRole("button", { name: "Advanced: manual credentials" }),
  ).toHaveCount(0);
  await dialog.getByLabel("Connection name").fill("Team Gitea");
  await dialog.getByLabel("Provider", { exact: true }).click();
  const instanceRequest = page.waitForRequest(
    "**/git/gitea/instances?teamId=team",
  );
  await page.getByRole("option", { name: "Gitea", exact: true }).click();
  await instanceRequest;
  await expect(
    dialog.getByRole("button", { name: "Add instance", exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel("Gitea instance", { exact: true }).click();
  await page
    .getByRole("option", { name: "Gitea instance", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Authorize Gitea", exact: true })
    .click();
  await expect(
    dialog.getByText("Authorization cancelled; try again.", { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1)?.body).toMatchObject({
    teamId: "team",
    instanceId: "instance",
  });
});

test("GitHub submits the manifest to the provider and returns to integration status", async ({
  page,
}) => {
  await setup(page);
  const home = new URL(page.url()).origin;
  await page.route("**/api/v1/git/setup/start", (route) =>
    route.fulfill({
      json: {
        connectionId: "git",
        url: "https://github.com/settings/apps/new?state=single-use",
        manifest: {
          name: "Shipyard-test",
          default_permissions: { contents: "read", pull_requests: "read" },
          default_events: ["push", "pull_request"],
        },
      },
    }),
  );
  let manifest: Record<string, unknown> = {};
  await page.route("https://github.com/settings/apps/new**", async (route) => {
    expect(route.request().method()).toBe("POST");
    manifest = JSON.parse(
      new URLSearchParams(route.request().postData() || "").get("manifest") ||
        "{}",
    );
    await route.fulfill({
      contentType: "text/html",
      body: `<h1>Approve GitHub App</h1><a href="${home}/integrations?gitConnected=1">Install repositories</a>`,
    });
  });
  await page
    .getByRole("region", { name: "Source control", exact: true })
    .getByRole("button", { name: "Add connection" })
    .click();
  await page.getByLabel("Connection name", { exact: true }).fill("GitHub code");
  await page
    .getByRole("button", { name: "Create GitHub App", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Approve GitHub App" }),
  ).toBeVisible();
  expect(manifest.default_permissions).toEqual({
    contents: "read",
    pull_requests: "read",
  });
  await page.getByRole("link", { name: "Install repositories" }).click();
  await expect(page.getByText(/Git connection authorized\./)).toBeVisible();
});

test("application setup lists ready Git connections for its team and shared options", async ({
  page,
}) => {
  await setup(page);
  const resource = {
    teamId: "team",
    parentId: "team",
    canWrite: true,
    data: {},
    variables: {},
    secretKeys: [],
    createdAt: "2026-10-19T00:00:00Z",
    updatedAt: "2026-10-19T00:00:00Z",
    version: 1,
  };
  const project = {
    ...resource,
    id: "project",
    kind: "project",
    name: "Project",
  };
  const environment = {
    ...resource,
    id: "environment",
    kind: "environment",
    name: "Production",
    parentId: project.id,
  };
  const ready = {
    ...resource,
    id: "ready",
    kind: "git",
    name: "Ready team Git",
    data: { provider: "github", status: "ready" },
  };
  await page.route(
    (endpoint) => endpoint.pathname === "/api/v1/resources",
    (route) =>
      route.fulfill({
        json: [
          project,
          environment,
          ready,
          {
            ...ready,
            id: "pending",
            name: "Pending team Git",
            data: { ...ready.data, status: "pending" },
          },
          {
            ...ready,
            id: "foreign",
            name: "Other team Git",
            teamId: "other-team",
            parentId: "other-team",
          },
          {
            ...ready,
            id: "shared",
            name: "Shared Git",
            teamId: "",
            parentId: "",
            data: { provider: "github" },
          },
        ],
      }),
  );
  await page.goto("/configure/application/new?parent=environment");
  await page.getByRole("combobox", { name: "Select git", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Ready team Git", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Shared Git", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Pending team Git", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: "Other team Git", exact: true }),
  ).toHaveCount(0);
});

test("Gitea reconnect redirects for browser consent and returns successfully", async ({
  page,
}) => {
  await setup(page, true);
  const home = new URL(page.url()).origin;
  await page.route("**/api/v1/git/git/reconnect", (route) =>
    route.fulfill({
      json: {
        connectionId: "git",
        url: "https://git.example.com/login/oauth/authorize?scope=read%3Auser+read%3Arepository",
      },
    }),
  );
  await page.route("https://git.example.com/login/oauth/authorize**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<h1>Authorize read-only access</h1><a href="${home}/integrations?gitConnected=1">Approve Gitea</a>`,
    }),
  );
  await page
    .getByRole("region", { name: "Source control", exact: true })
    .getByRole("button", { name: "Configure", exact: true })
    .click();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Authorize read-only access" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Approve Gitea" }).click();
  await expect(page.getByText(/Git connection authorized\./)).toBeVisible();
});
