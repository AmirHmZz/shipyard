import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

async function setup(page: Page, existing = false, admin = true) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const instance = {
    id: "instance",
    name: "Gitea instance",
    url: "https://git.example.com",
    clientId: "client",
    configured: true,
  };
  let secretConfigured = false;
  let configuredInstances = existing ? [instance] : [];
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
        json: existing
          ? [
              {
                parentId: "",
                teamId: "",
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
                canWrite: admin,
                secretKeys: ["oauth_token"],
                version: 1,
              },
            ]
          : [],
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

test("non-administrators cannot start provider setup", async ({ page }) => {
  await setup(page, false, false);
  await expect(
    page
      .getByRole("region", { name: "Source control", exact: true })
      .getByRole("button", { name: "Add connection", exact: true }),
  ).toBeDisabled();
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
