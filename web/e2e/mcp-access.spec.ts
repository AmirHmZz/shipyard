import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

test("admin creates, copies and revokes a project-scoped MCP token", async ({
  page,
  context,
}) => {
  const projectId = "10000000-0000-4000-8000-000000000001";
  const secondProject = "10000000-0000-4000-8000-000000000002";
  const token = {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Incident triage",
    projectIds: [projectId, secondProject],
    createdAt: "2026-11-21T00:00:00Z",
    expiresAt: "2026-12-21T00:00:00Z",
  };
  const secret = "syd_mcp_test-fixture";
  let issued = false;
  let revoked = false;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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
            id: "actor",
            name: "Admin",
            email: "admin@example.test",
            admin: true,
            totp: false,
          },
          csrf: "mcp-test-csrf",
          maintenance: false,
        },
      });
    if (path.endsWith("/resources")) return route.fulfill({ json: [] });
    if (path.endsWith("/settings/mcp-tokens")) {
      if (request.method() === "POST") {
        expect(request.headers()["x-csrf-token"]).toBe("mcp-test-csrf");
        expect(request.postDataJSON()).toEqual({
          name: token.name,
          projectIds: token.projectIds,
          expiryDays: 30,
        });
        issued = true;
        return route.fulfill({ status: 201, json: { token, secret } });
      }
      return route.fulfill({
        json: {
          endpoint: "https://shipyard.example.test/mcp",
          projects: [
            { id: projectId, name: "Production", teamName: "Operations" },
            { id: secondProject, name: "Tools", teamName: "Platform" },
          ],
          tokens: issued
            ? [
                {
                  ...token,
                  revokedAt: revoked ? "2026-11-22T00:00:00Z" : undefined,
                },
              ]
            : [],
        },
      });
    }
    if (path.endsWith("/settings/mcp-tokens/" + token.id)) {
      expect(request.method()).toBe("DELETE");
      expect(request.headers()["x-csrf-token"]).toBe("mcp-test-csrf");
      revoked = true;
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error("Unexpected MCP settings request: " + path);
  });

  await page.goto("/settings?tab=mcp");
  await expect(
    page.getByText("https://shipyard.example.test/mcp"),
  ).toBeVisible();
  await page.getByLabel("Token name").fill(token.name);
  await page.getByRole("checkbox", { name: "Operations / Production" }).check();
  await page.getByRole("checkbox", { name: "Platform / Tools" }).check();
  await page.getByRole("button", { name: "Create token" }).click();
  const displayed = page.getByLabel(
    "Copy this token now. It is displayed once.",
  );
  await expect(displayed).toHaveValue(secret);
  await page.getByRole("button", { name: "Copy token" }).click();
  await expect(page.getByText("Token copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    secret,
  );
  await page.getByRole("button", { name: "Done" }).click();
  await expect(displayed).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText(/^Revoked/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke", exact: true }),
  ).toHaveCount(0);
});
