import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { jsonObject } from "./json";

async function fixture(page: Page, writable = true, provider = "gitea") {
  const resource = (
    id: string,
    kind: string,
    parentId = "",
    data: Record<string, unknown> = {},
  ) => ({
    id,
    kind,
    parentId,
    data,
    name: id,
    teamId: "team",
    version: 1,
    canWrite: writable,
    secretKeys: [] as string[],
    variables: {} as Record<string, string>,
  });
  const resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("other-project", "project", "team"),
    { ...resource("env", "environment", "project"), name: "Production" },
    { ...resource("staging", "environment", "project"), name: "Staging" },
    {
      ...resource("other-env", "environment", "other-project"),
      name: "Production",
    },
    resource("server", "server"),
    resource("git", "git", "", { provider }),
    resource("zone", "zone", "dns", { domain: "example.com" }),
    resource("other-zone", "zone", "dns", { domain: "example.org" }),
    resource("app", "application", "env", {
      source: "git",
      engine: "dockerfile",
      serverId: "server",
      gitId: "git",
      repository: "owner/repo",
      branch: "saved-branch",
      context: ".",
      file: "Dockerfile",
    }),
    resource("route", "route", "app", {
      zoneId: "zone",
      domain: "api.dev.example.com",
      protocol: "https",
      tls: "terminate",
      service: "app",
      targetPort: 3000,
    }),
  ];
  const app = resources.find((r) => r.id === "app")!;
  app.variables = { "env:ORIGIN": "https://readable.example.com" };
  app.secretKeys = ["env:TOKEN"];
  const state = {
    writes: [] as Record<string, unknown>[],
    branchRequests: [] as string[],
    branchFailure: false,
    repoFailure: false,
    emptyBranches: false,
    emptyRepos: false,
    failSave: false,
    gate: null as Promise<void> | null,
    repoGate: null as Promise<void> | null,
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: { user: { id: "user", name: "User", admin: true }, csrf: "csrf" },
      });
    if (path.endsWith("/repositories")) {
      if (state.repoGate) await state.repoGate;
      return state.repoFailure
        ? route.fulfill({
            status: 502,
            json: { error: "Repository provider unavailable" },
          })
        : route.fulfill({
            json: state.emptyRepos
              ? []
              : [{ full_name: "owner/repo" }, { full_name: "owner/second" }],
          });
    }
    if (path.endsWith("/branches")) {
      const repository = url.searchParams.get("repository")!;
      state.branchRequests.push(repository);
      const gate = state.gate;
      if (gate) await gate;
      if (state.branchFailure)
        return route.fulfill({
          status: 502,
          json: { error: "Branch provider unavailable" },
        });
      return route.fulfill({
        json: state.emptyBranches
          ? []
          : [{ name: repository === "owner/second" ? "develop" : "main" }],
      });
    }
    if (path.endsWith("/services"))
      return route.fulfill({ json: [{ name: "app", replicas: 1 }] });
    if (path.endsWith("/resources") && request.method() === "GET")
      return route.fulfill({ json: resources });
    if (
      path.includes("/resources") &&
      ["POST", "PUT"].includes(request.method())
    ) {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.failSave)
        return route.fulfill({
          status: 409,
          json: { error: "Resource changed; refresh and try again" },
        });
      const current = resources.find((r) => path.endsWith(`/${r.id}`)) || app;
      for (const [key, value] of Object.entries(body.variables || {})) {
        current.secretKeys = current.secretKeys.filter((name) => name !== key);
        if (value === null) delete current.variables[key];
        else current.variables[key] = String(value);
      }
      for (const [key, value] of Object.entries(body.secrets || {})) {
        delete current.variables[key];
        current.secretKeys = current.secretKeys.filter((name) => name !== key);
        if (value !== "") current.secretKeys.push(key);
      }
      current.version++;
      return route.fulfill({ json: current });
    }
    return route.fulfill({ json: [] });
  });
  return state;
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

for (const theme of ["light", "dark"]) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (value) => localStorage.setItem("shipyard-theme:v1", value),
        theme,
      );
    });

    test("application creation scopes environments and has one repository/branch control", async ({
      page,
    }, info) => {
      const state = await fixture(page);
      await page.goto("/configure/application/new?parent=env");
      await expect(
        page.getByRole("combobox", { name: "Select project", exact: true }),
      ).toHaveText("project");
      await page
        .getByRole("combobox", { name: "Select environment", exact: true })
        .click();
      await expect(
        page.getByRole("option", { name: "Production", exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("option", { name: "Staging", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByLabel("Application runtime variables (KEY=value)"),
      ).toHaveCount(0);
      await page.getByLabel("Name", { exact: true }).fill("New app");
      await choose(page, "Select server", "server");
      await choose(page, "Select git", "git");
      await expect(
        page.getByRole("textbox", { name: "Repository", exact: true }),
      ).toHaveCount(0);
      await choose(page, "Select repository", "Other");
      await page.getByLabel("Repository owner/name").fill("manual/project");
      await expect
        .poll(() => state.branchRequests.includes("manual/project"))
        .toBeTruthy();
      await choose(page, "Select branch", "main");
      await expect(
        page.getByRole("textbox", { name: "Branch", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("repository_root/", { exact: true }),
      ).toHaveCount(2);
      await expect(
        page.getByText("Path relative to repository root.", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Dockerfile", { exact: true })).toHaveValue(
        "Dockerfile",
      );
      await choose(page, "Select Deployment type", "compose");
      await expect(
        page.getByLabel("Compose file", { exact: true }),
      ).toHaveValue("compose.yaml");
      await page.screenshot({
        path: info.outputPath(`application-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Save application", exact: true })
        .click();
      await expect.poll(() => state.writes.length).toBe(1);
      expect(state.writes[0]).toMatchObject({
        parentId: "env",
        data: {
          repository: "manual/project",
          branch: "main",
          context: ".",
          file: "compose.yaml",
        },
      });
      expect(state.writes[0]).not.toHaveProperty("variables");
      expect(state.writes[0].secrets).toEqual({});
    });

    test("routes use a zone suffix, reject full hostnames, and edit relative names", async ({
      page,
    }, info) => {
      const state = await fixture(page);
      await page.goto("/configure/route/new?parent=app");
      await expect(
        page.getByLabel("Subdomain", { exact: true }),
      ).toBeDisabled();
      await choose(page, "Select connected zone", "example.com");
      await expect(
        page.getByText(".example.com", { exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Subdomain", { exact: true })
        .fill("api.example.com");
      await choose(page, "Select Compose service", "app");
      await page
        .getByRole("button", { name: "Save route", exact: true })
        .click();
      await expect(
        page.getByText(
          "Enter only the subdomain; leave it blank for the zone itself.",
        ),
      ).toBeVisible();
      expect(state.writes).toHaveLength(0);
      await choose(page, "Select connected zone", "example.org");
      await expect(
        page.getByText(".example.org", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("Subdomain", { exact: true }).fill("");
      await page.screenshot({
        path: info.outputPath(`route-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Save route", exact: true })
        .click();
      await expect.poll(() => state.writes.length).toBe(1);
      expect(jsonObject(state.writes[0].data).domain).toBe("example.org");
      await page.goto("/configure/route/route");
      await expect(page.getByLabel("Subdomain", { exact: true })).toHaveValue(
        "api.dev",
      );
      await page
        .getByRole("button", { name: "Save route", exact: true })
        .click();
      await expect.poll(() => state.writes.length).toBe(2);
      expect(jsonObject(state.writes[1].data).domain).toBe(
        "api.dev.example.com",
      );
    });

    test("ordinary values and secrets can be edited, converted, and removed", async ({
      page,
    }, info) => {
      const state = await fixture(page);
      await page.goto("/configure/variables/app");
      await expect(
        page.getByText("https://readable.example.com", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("switch", { name: "Secret", exact: true }),
      ).not.toBeChecked();
      await page
        .getByRole("button", { name: "Edit env:ORIGIN", exact: true })
        .click();
      await expect(page.getByLabel("Variable name")).toBeDisabled();
      await expect(page.getByLabel("Value", { exact: true })).toHaveValue(
        "https://readable.example.com",
      );
      await page
        .getByLabel("Value", { exact: true })
        .fill("https://updated.example.com");
      state.failSave = true;
      await page
        .getByRole("button", { name: "Save variable", exact: true })
        .click();
      await expect(
        page.getByText("Resource changed; refresh and try again"),
      ).toBeVisible();
      await expect(page.getByLabel("Value", { exact: true })).toHaveValue(
        "https://updated.example.com",
      );
      state.failSave = false;
      await page
        .getByRole("button", { name: "Save variable", exact: true })
        .click();
      await expect(
        page.getByText("https://updated.example.com", { exact: true }),
      ).toBeVisible();
      expect(state.writes.at(-1)?.variables).toEqual({
        "env:ORIGIN": "https://updated.example.com",
      });
      await page
        .getByRole("button", { name: "Edit env:TOKEN", exact: true })
        .click();
      await expect(
        page.getByLabel("Replacement value", { exact: true }),
      ).toHaveValue("");
      await page.getByRole("switch", { name: "Secret", exact: true }).uncheck();
      await page
        .getByLabel("Replacement value", { exact: true })
        .fill("new-public-value");
      await page
        .getByRole("button", { name: "Save variable", exact: true })
        .click();
      await expect(
        page.getByText("new-public-value", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Edit env:ORIGIN", exact: true })
        .click();
      await page.getByRole("switch", { name: "Secret", exact: true }).check();
      await page
        .getByRole("button", { name: "Save variable", exact: true })
        .click();
      await expect(
        page.getByText("https://updated.example.com", { exact: true }),
      ).toHaveCount(0);
      expect(state.writes.at(-1)?.secrets).toEqual({
        "env:ORIGIN": "https://updated.example.com",
      });
      await page.screenshot({
        path: info.outputPath(`variables-${theme}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Remove env:ORIGIN", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByRole("cell", { name: "env:ORIGIN", exact: true }),
      ).toHaveCount(0);
      expect(state.writes.at(-1)?.secrets).toEqual({ "env:ORIGIN": "" });
      await page
        .getByRole("button", { name: "Remove env:TOKEN", exact: true })
        .click();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(
        page.getByRole("cell", { name: "env:TOKEN", exact: true }),
      ).toHaveCount(0);
      expect(state.writes.at(-1)?.variables).toEqual({ "env:TOKEN": null });
      await choose(page, "Scope", "BuildKit secret");
      await expect(
        page.getByRole("switch", { name: "Secret", exact: true }),
      ).toBeChecked();
      await expect(
        page.getByRole("switch", { name: "Secret", exact: true }),
      ).toBeDisabled();
    });
  });
}

for (const provider of ["github", "gitea"]) {
  test(`${provider} repository branding, compact loading, and configuration breadcrumbs`, async ({
    page,
  }, info) => {
    const state = await fixture(page, true, provider);
    let releaseRepositories!: () => void;
    let releaseBranches!: () => void;
    state.repoGate = new Promise<void>((resolve) => {
      releaseRepositories = resolve;
    });
    state.gate = new Promise<void>((resolve) => {
      releaseBranches = resolve;
    });
    await page.goto("/configure/application/new?parent=env");
    const breadcrumb = page.getByRole("navigation", {
      name: "Configuration navigation",
    });
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(
      "New application",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Workspace navigation" })
        .locator('[aria-current="page"]'),
    ).toHaveText("New application");
    const connection = page.getByRole("combobox", {
      name: "Select git",
      exact: true,
    });
    await connection.click();
    const git = page.getByRole("option", { name: "git", exact: true });
    await expect(git.locator("img")).toHaveAttribute(
      "src",
      `/brands/${provider}.svg`,
    );
    await page.keyboard.press("g");
    await page.keyboard.press("Enter");
    await expect(connection.locator("img")).toHaveAttribute(
      "src",
      `/brands/${provider}.svg`,
    );
    const loadingRepositories = page.getByRole("status", {
      name: "Loading repositories…",
      exact: true,
    });
    await expect(
      loadingRepositories.locator('[data-slot="spinner"]'),
    ).toBeVisible();
    releaseRepositories();
    const repository = page.getByRole("combobox", {
      name: "Select repository",
      exact: true,
    });
    await repository.click();
    await expect(
      page
        .getByRole("option", { name: "owner/repo", exact: true })
        .locator("img"),
    ).toHaveAttribute("src", `/brands/${provider}.svg`);
    await page.getByRole("option", { name: "owner/repo", exact: true }).click();
    await expect(repository.locator("img")).toHaveAttribute(
      "src",
      `/brands/${provider}.svg`,
    );
    const loadingBranches = page.getByRole("status", {
      name: "Loading branches…",
      exact: true,
    });
    await expect(
      loadingBranches.locator('[data-slot="spinner"]'),
    ).toBeVisible();
    await expect(loadingBranches).toHaveCSS("height", "36px");
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`${provider}-loading-light.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.screenshot({
      path: info.outputPath(`${provider}-loading-dark.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    releaseBranches();
    await choose(page, "Select branch", "main");
    await expect(loadingBranches).toHaveCount(0);
    // A fresh navigation keeps this visual test independent of the unsaved form.
    await page.goto("/projects/project");
    const card = page
      .getByRole("main")
      .getByRole("link", { name: /app.*owner\/repo/ });
    await expect(
      card.locator(`img[src="/brands/${provider}.svg"]`),
    ).toBeVisible();
    await card.click();
    await expect(
      page
        .getByRole("navigation", { name: "Workspace navigation" })
        .locator('[aria-current="page"]'),
    ).toHaveText("app");
    await expect(
      page.getByRole("main").locator(`img[src="/brands/${provider}.svg"]`),
    ).toHaveCount(2);
  });
}

test("branch loading, errors, retries, empty results, and stale responses", async ({
  page,
}) => {
  const state = await fixture(page);
  let release!: () => void;
  state.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.goto("/configure/application/app");
  await expect(
    page.getByRole("status", { name: "Loading branches…", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status", { name: "Loading branches…", exact: true })
      .locator('[data-slot="spinner"]'),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await choose(page, "Select repository", "owner/second");
  state.gate = null;
  await expect
    .poll(() => state.branchRequests.includes("owner/second"))
    .toBeTruthy();
  release();
  await choose(page, "Select branch", "develop");
  await expect(
    page.getByRole("combobox", { name: "Select branch", exact: true }),
  ).toHaveText("develop");
  state.branchFailure = true;
  await choose(page, "Select repository", "Other");
  await page.getByLabel("Repository owner/name").fill("manual/retry");
  await expect(page.getByText("Branch provider unavailable")).toBeVisible();
  state.branchFailure = false;
  state.emptyBranches = true;
  await page
    .getByRole("button", { name: "Retry branches", exact: true })
    .click();
  await expect(
    page.getByText("No branches found in this repository."),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Select branch", exact: true }),
  ).toBeDisabled();
});

test("missing project context, repository failure, saved branch, and reader permissions", async ({
  page,
}) => {
  const state = await fixture(page, false);
  state.repoFailure = true;
  await page.goto("/configure/application/new");
  await expect(
    page.getByRole("combobox", { name: "Select environment", exact: true }),
  ).toBeDisabled();
  await choose(page, "Select project", "project");
  await choose(page, "Select environment", "Staging");
  await choose(page, "Select git", "git");
  await expect(page.getByText("Repository provider unavailable")).toBeVisible();
  state.repoFailure = false;
  state.emptyRepos = true;
  await page
    .getByRole("button", { name: "Retry repositories", exact: true })
    .click();
  await expect(
    page.getByText(
      "No repositories found. Select Other to enter one manually.",
    ),
  ).toBeVisible();
  await page.goto("/configure/application/app");
  await expect(page.getByLabel("Repository owner/name")).toHaveValue(
    "owner/repo",
  );
  await expect(
    page.getByRole("combobox", { name: "Select branch", exact: true }),
  ).toHaveText("saved-branch");
  await page.goto("/configure/variables/app");
  await expect(page.getByLabel("Variable name")).toHaveCount(0);
  await expect(
    page.getByText("https://readable.example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit env:ORIGIN", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove env:TOKEN", exact: true }),
  ).toBeDisabled();
});
