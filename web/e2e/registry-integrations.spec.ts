import { expect, test } from "@playwright/test";

test("registry integrations save encrypted credentials and support team grants", async ({
  page,
}) => {
  function resource(id: string, kind: string, data = {}) {
    const secretKeys: string[] = [];
    return {
      id,
      kind,
      name: id === "team" ? "Example team" : "Image registry",
      data,
      teamId: "",
      parentId: "",
      version: 1,
      canWrite: true,
      variables: {},
      secretKeys,
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    };
  }
  const resources = [resource("team", "team")];
  let saved: Record<string, unknown> | undefined;
  let grant: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (path === "/telemetry") return route.fulfill({ json: { dsn: "" } });
    if (path === "/auth/me")
      return route.fulfill({
        json: {
          user: {
            id: "admin",
            name: "Admin",
            email: "admin@example.test",
            admin: true,
            totp: false,
          },
          csrf: "csrf",
        },
      });
    if (path === "/resources" && request.method() === "GET")
      return route.fulfill({ json: resources });
    if (path === "/deployments") return route.fulfill({ json: [] });
    if (path === "/resources" && request.method() === "POST") {
      saved = request.postDataJSON();
      const registry = {
        ...resource("registry", "registry", {
          hostname: "ghcr.io",
          username: "alice",
        }),
        secretKeys: ["password"],
      };
      resources.push(registry);
      return route.fulfill({ status: 201, json: registry });
    }
    if (path === "/resources/registry/grants") {
      if (request.method() === "GET") return route.fulfill({ json: [] });
      grant = request.postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/resources/registry" && request.method() === "DELETE") {
      resources.splice(1);
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error(`Unexpected ${request.method()} ${path}`);
  });
  await page.goto("/integrations");
  const registries = page.getByRole("region", { name: "Container registries" });
  await registries.getByRole("button", { name: "Add connection" }).click();
  await page.getByLabel("Name", { exact: true }).fill("GitHub images");
  await page.getByLabel("Registry hostname", { exact: true }).fill("ghcr.io");
  await page.getByLabel("Username", { exact: true }).fill("alice");
  await page.getByLabel("Password / token", { exact: true }).fill("test-token");
  await page.getByRole("button", { name: /^Save registry$/i }).click();
  await expect
    .poll(() => saved)
    .toMatchObject({
      kind: "registry",
      data: { hostname: "ghcr.io", username: "alice" },
      secrets: { password: "test-token" },
    });
  expect(saved?.data).not.toHaveProperty("password");
  await expect(page).toHaveURL(/\/integrations$/);
  await expect(registries.getByText("ghcr.io")).toBeVisible();
  await registries.getByRole("button", { name: "Team access" }).click();
  await expect(page.getByText("Example team")).toBeVisible();
  await page.getByRole("switch").click();
  await expect.poll(() => grant).toEqual({ teamId: "team", granted: true });
  await page.goto("/integrations");
  await registries.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(registries.getByText("ghcr.io")).not.toBeVisible();
});
