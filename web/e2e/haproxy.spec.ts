import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import type { components } from "../src/lib/schema";

import { buildInfoFixture } from "./build-info";
type Settings = components["schemas"]["HAProxySettings"];
type Input = components["schemas"]["HAProxySettingsInput"];

async function setup(page: Page, admin = true) {
  const state: Settings = {
    version: 0,
    bindings: {},
    lastJobId: "",
    appliedAt: null,
    image: "haproxy:3.4-alpine",
    apply: null,
    frontends: [
      {
        id: "web",
        name: "Web",
        protocol: "HTTP / HTTPS / gRPC",
        applicationId: "",
        applicationName: "",
        ports: [80, 443],
        addresses: ["0.0.0.0", "::"],
        defaultAddresses: ["0.0.0.0", "::"],
        useDefaults: true,
      },
      {
        id: "tcp-route",
        name: "Database TCP",
        protocol: "TCP",
        applicationId: "app",
        applicationName: "My application",
        ports: [15432],
        addresses: ["0.0.0.0", "::"],
        defaultAddresses: ["0.0.0.0", "::"],
        useDefaults: true,
      },
    ],
  };
  const writes: Input[] = [];
  let pending: Input | null = null;
  let polls = 0;
  let reject = "";
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
            id: "admin",
            name: "Administrator",
            email: "admin@shipyard.test",
            admin,
            totp: false,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources"))
      return route.fulfill({
        json: [
          {
            variables: {},
            id: "server",
            kind: "server",
            name: "Destination",
            parentId: "",
            teamId: "",
            data: { host: "server.test", user: "root" },
            secretKeys: [],
            canWrite: admin,
            version: 1,
            createdAt: "2026-10-15T00:00:00Z",
            updatedAt: "2026-10-15T00:00:00Z",
          },
        ],
      });
    if (path.endsWith("/metrics")) return route.fulfill({ json: [] });
    if (path.endsWith("/haproxy")) {
      if (request.method() === "PUT") {
        const input: Input = request.postDataJSON();
        writes.push(input);
        expect(request.headers()["x-csrf-token"]).toBe("csrf");
        if (reject)
          return route.fulfill({ status: 400, json: { error: reject } });
        pending = input;
        polls = 0;
        state.apply = {
          id: `job-${writes.length}`,
          state: "queued",
          error: "",
        };
        return route.fulfill({ status: 202, json: { jobId: state.apply.id } });
      }
      if (pending && ++polls >= 2) {
        state.version++;
        state.bindings = pending.bindings;
        state.lastJobId = state.apply!.id;
        state.apply!.state = "done";
        state.appliedAt = new Date().toISOString();
        pending = null;
        for (const frontend of state.frontends) {
          frontend.addresses =
            state.bindings[frontend.id] || frontend.defaultAddresses;
          frontend.useDefaults = !(frontend.id in state.bindings);
        }
      }
      return route.fulfill({ json: state });
    }
    throw new Error(`Unexpected API ${path}`);
  });
  await page.goto("/servers");
  return {
    state,
    writes,
    rejectNext(message: string) {
      reject = message;
    },
  };
}

test("address identity survives removal and typing", async ({ page }) => {
  const { writes } = await setup(page);
  await page
    .getByRole("button", { name: "HAProxy settings", exact: true })
    .click();
  const web = page.getByRole("region", { name: "Web", exact: true });
  await web.getByRole("switch", { name: "Use default addresses" }).click();
  const second = web.getByLabel("Web IP address 2", { exact: true });
  await second.fill("::1");
  await second.evaluate((node) => {
    (node as HTMLElement).dataset.retained = "address";
  });
  await web
    .getByRole("button", { name: "Remove Web address 1", exact: true })
    .click();
  const remaining = web.getByLabel("Web IP address 1", { exact: true });
  await expect(remaining).toHaveAttribute("data-retained", "address");
  await remaining.fill("127.0.0.1");
  await expect(remaining).toHaveAttribute("data-retained", "address");
  await page.getByRole("button", { name: "Save & apply" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({ version: 0, bindings: { web: ["127.0.0.1"] } });
});

test("web and TCP bindings can be edited and applied independently", async ({
  page,
}, info) => {
  const { writes } = await setup(page);
  await page
    .getByRole("button", { name: "HAProxy settings", exact: true })
    .click();
  const dialog = page.getByRole("main");
  await expect(
    dialog.getByText("haproxy:3.4-alpine", { exact: false }),
  ).toBeVisible();
  const web = dialog.getByRole("region", { name: "Web", exact: true });
  const tcp = dialog.getByRole("region", { name: "Database TCP", exact: true });
  await web.getByRole("switch", { name: "Use default addresses" }).click();
  await web.getByLabel("Web IP address 1", { exact: true }).fill("127.0.0.1");
  await web.getByRole("button", { name: "Remove Web address 2" }).click();
  await tcp.getByRole("switch", { name: "Use default addresses" }).click();
  await tcp
    .getByLabel("Database TCP IP address 1", { exact: true })
    .fill("::1");
  await tcp
    .getByRole("button", { name: "Remove Database TCP address 2" })
    .click();
  await tcp.getByRole("button", { name: "Add address", exact: true }).click();
  await tcp
    .getByLabel("Database TCP IP address 2", { exact: true })
    .fill("192.168.1.10");
  await page.screenshot({
    path: info.outputPath("haproxy-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Save & apply" }).click();
  await expect(
    dialog.getByText("Validating and applying HAProxy bindings…", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save & apply" }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("HAProxy settings applied.", { exact: true }),
  ).toBeVisible();
  expect(writes[0]).toEqual({
    version: 0,
    bindings: { web: ["127.0.0.1"], "tcp-route": ["::1", "192.168.1.10"] },
  });
  await web.getByRole("switch", { name: "Use default addresses" }).click();
  await expect(web.getByText("0.0.0.0, ::", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Save & apply" }).click();
  await expect(
    dialog.getByText("HAProxy settings applied.", { exact: true }),
  ).toBeVisible();
  expect(writes[1]).toEqual({
    version: 1,
    bindings: { "tcp-route": ["::1", "192.168.1.10"] },
  });
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page
    .getByRole("button", { name: "HAProxy settings", exact: true })
    .click();
  await expect(
    page.getByRole("main").getByText("Revision 2", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("haproxy-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("validation errors retain edits and external revisions require refresh", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page
    .getByRole("button", { name: "HAProxy settings", exact: true })
    .click();
  const dialog = page.getByRole("main");
  const web = dialog.getByRole("region", { name: "Web", exact: true });
  await web.getByRole("switch", { name: "Use default addresses" }).click();
  await web.getByLabel("Web IP address 1", { exact: true }).fill("localhost");
  fixture.rejectNext(
    "Enter an IPv4 or IPv6 address without a hostname or port.",
  );
  await dialog.getByRole("button", { name: "Save & apply" }).click();
  await expect(
    dialog.getByText(
      "Enter an IPv4 or IPv6 address without a hostname or port.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(web.getByLabel("Web IP address 1", { exact: true })).toHaveValue(
    "localhost",
  );
  fixture.state.version = 1;
  fixture.state.bindings = { web: ["192.168.0.10"] };
  await expect(
    dialog.getByText("Settings changed since this form was loaded.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save & apply" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Reload saved settings" }).click();
  await expect(web.getByLabel("Web IP address 1", { exact: true })).toHaveValue(
    "192.168.0.10",
  );
});

test("HAProxy configuration is not offered to non-administrators", async ({
  page,
}) => {
  await setup(page, false);
  await expect(
    page.getByRole("heading", { name: "Servers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "HAProxy settings", exact: true }),
  ).toHaveCount(0);
});
