import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

test("admin creates, edits, revokes, recreates and deletes MCP tokens", async ({
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
  const expired = {
    ...token,
    id: "20000000-0000-4000-8000-000000000002",
    name: "Build alerts",
    projectIds: [projectId],
    createdAt: "2026-10-01T00:00:00Z",
    expiresAt: "2026-10-31T00:00:00Z",
  };
  const secret = "syd_mcp_test-fixture";
  const replacement = "syd_mcp_recreated-fixture";
  let issued = false;
  let revoked = false;
  let edited = false;
  let recreated = false;
  let deleted = false;
  await page.clock.setFixedTime(new Date("2026-11-21T13:00:00Z"));
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
          tokens: [
            ...(issued
              ? [
                  {
                    ...token,
                    projectIds: edited ? [secondProject] : token.projectIds,
                    revokedAt: revoked ? "2026-11-21T13:01:00Z" : undefined,
                  },
                ]
              : []),
            ...(deleted
              ? []
              : [
                  {
                    ...expired,
                    expiresAt: recreated
                      ? "2026-11-28T13:00:00Z"
                      : expired.expiresAt,
                  },
                ]),
          ],
        },
      });
    }
    if (path.endsWith("/settings/mcp-tokens/" + token.id)) {
      expect(request.headers()["x-csrf-token"]).toBe("mcp-test-csrf");
      if (request.method() === "PATCH") {
        expect(request.postDataJSON()).toEqual({ projectIds: [secondProject] });
        edited = true;
      } else {
        expect(request.method()).toBe("DELETE");
        revoked = true;
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (path.endsWith(`/settings/mcp-tokens/${expired.id}/recreate`)) {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrf-token"]).toBe("mcp-test-csrf");
      expect(request.postDataJSON()).toEqual({ expiryDays: 7 });
      recreated = true;
      return route.fulfill({
        json: {
          token: { ...expired, expiresAt: "2026-11-28T13:00:00Z" },
          secret: replacement,
        },
      });
    }
    if (path.endsWith(`/settings/mcp-tokens/${expired.id}/record`)) {
      expect(request.method()).toBe("DELETE");
      expect(request.headers()["x-csrf-token"]).toBe("mcp-test-csrf");
      deleted = true;
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error("Unexpected MCP settings request: " + path);
  });

  await page.goto("/settings?tab=mcp");
  await expect(
    page.getByText("https://shipyard.example.test/mcp"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy endpoint" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "https://shipyard.example.test/mcp",
  );

  const dialog = page.getByRole("dialog");
  const tokenRow = page.getByRole("listitem").filter({ hasText: token.name });
  const expiredRow = page
    .getByRole("listitem")
    .filter({ hasText: expired.name });
  await expect(expiredRow.getByText("Expired", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create token" }).click();
  await dialog.getByLabel("Token name").fill(token.name);
  await dialog
    .getByRole("checkbox", { name: "Operations / Production" })
    .check();
  await dialog.getByRole("checkbox", { name: "Platform / Tools" }).check();
  await dialog.getByRole("button", { name: "Create token" }).click();
  const displayed = dialog.getByLabel(
    "Copy this token now. It is displayed once.",
  );
  await expect(displayed).toHaveValue(secret);
  await dialog.getByRole("button", { name: "Copy token" }).click();
  await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    secret,
  );
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(displayed).toHaveCount(0);

  const actions = tokenRow.getByRole("button", {
    name: `Actions for ${token.name}`,
  });
  await actions.click();
  await page.getByRole("menuitem", { name: "Edit access" }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Platform / Tools" }),
  ).toBeChecked();
  await dialog
    .getByRole("searchbox", { name: "Search projects" })
    .fill("production");
  await expect(
    dialog.getByRole("checkbox", { name: "Operations / Production" }),
  ).toBeChecked();
  await dialog
    .getByRole("checkbox", { name: "Operations / Production" })
    .uncheck();
  await dialog.getByRole("button", { name: "Save access" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tokenRow.getByText("Operations / Production")).toHaveCount(0);
  await expect(tokenRow.getByText("Platform / Tools")).toBeVisible();
  await expect(actions).toBeFocused();

  await actions.click();
  await page.getByRole("menuitem", { name: "Revoke token" }).click();
  await dialog.getByRole("button", { name: "Revoke token" }).click();
  await expect(tokenRow.getByText("Revoked", { exact: true })).toBeVisible();

  const expiredActions = expiredRow.getByRole("button", {
    name: `Actions for ${expired.name}`,
  });
  await expiredActions.click();
  await page.getByRole("menuitem", { name: "Recreate token" }).click();
  await expect(dialog.getByLabel("New lifetime (days)")).toHaveValue("30");
  await dialog.getByLabel("New lifetime (days)").fill("7");
  await dialog.getByRole("button", { name: "Recreate token" }).click();
  await expect(displayed).toHaveValue(replacement);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(expiredRow.getByText("Active", { exact: true })).toBeVisible();
  await expect(expiredRow.getByText("Operations / Production")).toBeVisible();

  await expiredActions.click();
  await page.getByRole("menuitem", { name: "Delete record" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Delete token record" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Delete record" }).click();
  await expect(expiredRow).toHaveCount(0);
});
