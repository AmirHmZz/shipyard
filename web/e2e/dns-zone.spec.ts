import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import type { components } from "../src/lib/schema";

import { buildInfoFixture } from "./build-info";

type Resource = components["schemas"]["Resource"];
type ResourceInput = components["schemas"]["ResourceInput"];

function resource(id: string, input: ResourceInput): Resource {
  const { secrets, ...details } = input;
  const variables: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.variables || {})) {
    if (value !== null) variables[name] = value;
  }
  return {
    id,
    ...details,
    name: input.name || "",
    variables,
    parentId: input.parentId || "",
    teamId: input.teamId || "",
    secretKeys: Object.keys(secrets || {}),
    canWrite: true,
    version: 1,
    createdAt: "2026-10-15T00:00:00Z",
    updatedAt: "2026-10-15T00:00:00Z",
  };
}

// Keep these UI regressions independent of live DNS credentials and PostgreSQL.
async function mockAPI(page: Page, initial: Resource[] = []) {
  const resources = [...initial];
  const writes: ResourceInput[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/version"))
      return route.fulfill({ json: buildInfoFixture });
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path === "/api/v1/auth/me") {
      return route.fulfill({
        json: {
          user: {
            id: "admin",
            name: "Administrator",
            email: "admin@shipyard.test",
            admin: true,
            totp: false,
          },
          csrf: "test-csrf",
        },
      });
    }
    if (path === "/api/v1/resources") {
      if (request.method() === "GET") return route.fulfill({ json: resources });
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrf-token"]).toBe("test-csrf");
      const input: ResourceInput = request.postDataJSON();
      writes.push(input);
      const saved = resource(`resource-${writes.length}`, input);
      resources.push(saved);
      return route.fulfill({ status: 201, json: saved });
    }
    if (path.endsWith("/zones"))
      return route.fulfill({
        json: [{ id: "example.com", name: "example.com" }],
      });
    if (path.endsWith("/records")) return route.fulfill({ json: [] });
    throw new Error(`Unexpected API request: ${request.method()} ${path}`);
  });
  await page.goto("/dns");
  await page.getByRole("button", { name: "Add zone", exact: true }).click();
  return writes;
}

test("a zone can select either saved DNS provider", async ({ page }) => {
  const writes = await mockAPI(page, [
    resource("cloudflare", {
      kind: "dns",
      name: "Cloudflare production",
      data: { provider: "cloudflare" },
    }),
    resource("arvan", {
      kind: "dns",
      name: "ArvanCloud production",
      data: { provider: "arvancloud" },
    }),
  ]);
  const dialog = page.getByRole("main");
  const selector = dialog.getByRole("combobox", {
    name: /^Select (dns|DNS provider)$/i,
  });
  await expect(selector).toBeEnabled();
  await selector.click();
  await page.getByRole("option", { name: "Cloudflare production" }).click();
  await expect(selector).toHaveText("Cloudflare production");
  await selector.click();
  await page.getByRole("option", { name: "ArvanCloud production" }).click();
  await expect(selector).toHaveText("ArvanCloud production");
  await dialog
    .getByRole("combobox", { name: "Select available domain" })
    .click();
  await page.getByRole("option", { name: "example.com", exact: true }).click();
  await dialog.getByRole("button", { name: "Save zone" }).click();
  await expect(page).toHaveURL(/dns\/resource-1$/);
  expect(writes).toEqual([
    expect.objectContaining({ kind: "zone", parentId: "arvan" }),
  ]);
});

test("an empty DNS selector directs administrators to Integrations", async ({
  page,
}) => {
  const writes = await mockAPI(page);
  await expect(
    page.getByText(
      "No DNS providers connected. Configure a provider under Integrations first.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save zone" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add DNS provider" }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});
