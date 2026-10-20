import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

async function fixture(page: Page) {
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
    canWrite: true,
    secretKeys: [],
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
  });
  const resources = [
    resource("team", "team"),
    resource("project", "project", "team"),
    resource("env", "environment", "project"),
    resource("server", "server"),
    resource("dns", "dns"),
    resource("zone", "zone", "dns", { domain: "example.com" }),
    resource("app", "application", "env", {
      source: "git",
      engine: "compose",
      serverId: "server",
      gitId: "git",
      repository: "owner/repo",
      branch: "main",
    }),
    resource("git", "git", "", { provider: "gitea" }),
  ];
  const state = {
    containers: ["first", "second"],
    runtimeRequests: 0,
    releases: 0,
    records: 0,
    content: "initial",
    writes: [] as string[],
    payloads: [] as Record<string, unknown>[],
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: {
            id: "user",
            name: "User",
            email: "user@example.com",
            admin: true,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources")) return route.fulfill({ json: resources });
    if (path.endsWith("/releases")) {
      state.releases++;
      return route.fulfill({ json: [] });
    }
    if (path.endsWith("/records")) {
      state.records++;
      return route.fulfill({
        json: [
          {
            id: "record",
            type: "A",
            name: "example.com",
            content: state.content,
            ttl: 120,
            proxied: false,
          },
        ],
      });
    }
    if (path.endsWith("/networking")) {
      if (request.method() === "GET")
        return route.fulfill({
          json: { version: 1, services: {}, pending: false },
        });
      state.writes.push(path);
      state.payloads.push(request.postDataJSON());
      return route.fulfill({ json: {} });
    }
    if (path.endsWith("/published-ports")) {
      state.writes.push(path);
      state.payloads.push(request.postDataJSON());
      return route.fulfill({ json: {} });
    }
    if (path.endsWith("/services"))
      return route.fulfill({
        json: [{ name: "web", replicas: 1, ignoredPorts: false }],
      });
    if (path.endsWith("/runtime")) {
      state.runtimeRequests++;
      return route.fulfill({
        json: { status: "running", containers: state.containers },
      });
    }
    return route.fulfill({ json: [] });
  });
  return state;
}

test("framework routes survive direct loads, refreshes, and session changes", async ({
  page,
}) => {
  await fixture(page);
  let signedIn = true;
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: signedIn
        ? {
            user: {
              id: "user",
              name: "User",
              email: "user@example.com",
              admin: true,
            },
            csrf: "csrf",
          }
        : null,
    }),
  );
  await page.goto("/servers");
  await expect(
    page.getByRole("heading", { name: "Servers", exact: true }),
  ).toBeVisible();
  await page.goto("/dns/zone/records/record");
  await expect(page.locator("form input").nth(1)).toHaveValue("initial");
  await page.reload();
  await expect(page.locator("form input").nth(1)).toHaveValue("initial");
  await page.goto("/unknown/dashboard/path");
  await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
  signedIn = false;
  await page.reload();
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible();
  signedIn = true;
  await page.reload();
  await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
});

test("a stalled telemetry request cannot hold the dashboard's first render", async ({
  page,
}) => {
  await fixture(page);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/telemetry", async (route) => {
    await hold;
    await route.fulfill({ json: { dsn: "" } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  try {
    await expect(
      page.getByRole("heading", { name: "A clear view of what’s shipping." }),
    ).toBeVisible({ timeout: 2500 });
  } finally {
    release();
  }
});

test("blocked browser storage still allows theme switching", async ({
  page,
}) => {
  await fixture(page);
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"])
      Object.defineProperty(Storage.prototype, method, {
        value: () => {
          throw new Error("Storage disabled");
        },
      });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("heading", { name: "Something went wrong" }),
  ).toHaveCount(0);
});

test("opening and dismissing a select is not an unsaved edit", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/configure/application/app");
  await page
    .getByRole("combobox", { name: "Select Source", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toHaveCount(0);
});

test("saving networking leaves unsaved published ports protected", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/applications/app?tab=networking");
  await page.getByLabel("Container hostname").fill("draft-host");
  await page.getByRole("button", { name: "Add port exception" }).click();
  await page
    .getByRole("button", { name: "Save networking", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  await page
    .getByRole("link", { name: /^Projects/ })
    .first()
    .click();
  const confirm = page.getByRole("dialog", {
    name: "Discard unsaved changes?",
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Host port", { exact: true })).toHaveValue(
    "8080",
  );
  await page.getByRole("button", { name: "Save published ports" }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  await page
    .getByRole("link", { name: /^Projects/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("retained releases are fetched only while deployments is selected", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/applications/app?tab=networking");
  await expect(page.getByLabel("Container hostname")).toBeVisible();
  expect(state.releases).toBe(0);
  await page.getByRole("tab", { name: "deployments", exact: true }).click();
  await expect.poll(() => state.releases).toBe(1);
  await page.getByRole("tab", { name: "networking", exact: true }).click();
  await page.clock.install();
  await page.clock.fastForward(11000);
  expect(state.releases).toBe(1);
});

test("removing an editable row preserves the remaining row and keeps UI IDs out of saves", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/applications/app?tab=networking");
  await page
    .getByRole("button", { name: "Connect network", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect network", exact: true })
    .click();
  const addresses = page.getByLabel("Fixed IPv4 (optional)", { exact: true });
  await addresses.nth(1).fill("192.168.1.20");
  await addresses.nth(1).evaluate((node) => {
    (node as HTMLElement).dataset.retained = "network";
  });
  await page
    .getByRole("button", { name: "Disconnect on next deployment" })
    .first()
    .click();
  await expect(addresses).toHaveCount(1);
  await expect(addresses).toHaveAttribute("data-retained", "network");
  await expect(addresses).toHaveValue("192.168.1.20");
  await page
    .getByRole("button", { name: "Save networking", exact: true })
    .click();
  await expect.poll(() => state.payloads.length).toBe(1);
  expect(state.payloads[0]).toMatchObject({
    services: {
      web: { connections: [{ networkId: "", ipv4: "192.168.1.20" }] },
    },
  });

  await page.getByRole("button", { name: "Add port exception" }).click();
  await page.getByRole("button", { name: "Add port exception" }).click();
  const ports = page.getByLabel("Host port", { exact: true });
  await ports.nth(1).fill("9090");
  await ports.nth(1).evaluate((node) => {
    (node as HTMLElement).dataset.retained = "port";
  });
  await page
    .getByRole("button", { name: "Remove published port" })
    .first()
    .click();
  await expect(ports).toHaveCount(1);
  await expect(ports).toHaveAttribute("data-retained", "port");
  await expect(ports).toHaveValue("9090");
  await page
    .getByRole("button", { name: "Save published ports", exact: true })
    .click();
  await expect.poll(() => state.payloads.length).toBe(2);
  expect(state.payloads[1]).toMatchObject({
    services: {
      web: [
        { host: "0.0.0.0", published: 9090, target: 8080, protocol: "tcp" },
      ],
    },
  });
  expect(JSON.stringify(state.payloads)).not.toContain("rowId");
});

test("a reconnect refetch preserves unsaved DNS record text", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/dns/zone/records/record");
  // The shell has no visible search textbox; the DNS form's second input is Content.
  const field = page.locator("form input").nth(1);
  await expect(field).toHaveValue("initial");
  await field.fill("unsaved");
  state.content = "remote-change";
  await page.clock.install();
  await page.clock.fastForward(6000);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => state.records).toBeGreaterThan(1);
  await expect(field).toHaveValue("unsaved");
});

test("unrelated inventory changes preserve the log connection and history", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.addInitScript(() => {
    class Source extends EventTarget {
      static CLOSED = 2;
      readyState = 1;
      constructor(readonly url: string) {
        super();
        const holder = window as unknown as { logSources: Source[] };
        (holder.logSources ??= []).push(this);
      }
      close() {
        this.readyState = Source.CLOSED;
      }
    }
    Object.defineProperty(window, "EventSource", { value: Source });
  });
  await page.goto("/applications/app?tab=logs");
  await expect(page.getByText("Waiting for log output…")).toBeVisible();
  const count = await page.evaluate(() => {
    const sources = (window as unknown as { logSources: EventTarget[] })
      .logSources;
    sources.at(-1)!.dispatchEvent(
      new MessageEvent("log", {
        data: JSON.stringify({ message: "retained output" }),
      }),
    );
    return sources.length;
  });
  await expect(page.locator("pre")).toContainText("retained output");
  const requests = state.runtimeRequests;
  state.containers = ["first", "third"];
  await expect.poll(() => state.runtimeRequests).toBeGreaterThan(requests);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { logSources: EventTarget[] }).logSources.length,
    ),
  ).toBe(count);
  await expect(page.locator("pre")).toContainText("retained output");
});

test("server charts load only where a metrics chart is rendered", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/v1/servers/server/metrics", (route) =>
    route.fulfill({
      json: [
        {
          timestamp: "2026-10-18T00:00:00Z",
          online: true,
          cpu: 10,
          memory: 20,
          disk: 30,
          containers: [],
        },
        {
          timestamp: "2026-10-18T00:00:30Z",
          online: true,
          cpu: 15,
          memory: 20,
          disk: 30,
          containers: [],
        },
      ],
    }),
  );
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.goto("/integrations");
  await expect(
    page.getByRole("heading", { name: "Integrations", exact: true }),
  ).toBeVisible();
  expect(scripts.some((url) => url.includes("ServerCPUChart"))).toBe(false);
  await page.goto("/servers");
  await expect(page.locator('[data-slot="chart"]')).toBeVisible();
  expect(scripts.some((url) => url.includes("ServerCPUChart"))).toBe(true);
});

test("generating a signing secret protects the unsaved draft", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/configure/git/new");
  await page
    .getByRole("button", { name: "Generate signing secret", exact: true })
    .click();
  await expect(
    page.getByLabel("Webhook signing secret", { exact: true }),
  ).toHaveValue(/^[a-f0-9]{64}$/);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Workspace", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Discard unsaved changes?" }),
  ).toBeVisible();
});
