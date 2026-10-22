import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

test("network removal is immediate, rolls back on failure, and preserves external Docker networks", async ({
  page,
}) => {
  function resource(id: string, kind: string, name: string, data = {}) {
    return {
      id,
      kind,
      name,
      data,
      parentId: "",
      teamId: "team",
      variables: {},
      secretKeys: [],
      canWrite: true,
      version: 1,
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    };
  }
  function docker(id: string, name: string, labels = {}) {
    return {
      Id: id,
      Name: name,
      Driver: "bridge",
      EnableIPv6: false,
      Labels: labels,
      Containers: {},
      IPAM: { Config: [] },
    };
  }
  let removed = false;
  let reject = true;
  let releaseCallback: (() => void) | undefined;
  function release() {
    releaseCallback?.();
  }
  const gate = new Promise<void>((resolve) => {
    releaseCallback = resolve;
  });
  const writes: { path: string; method: string; body: string | null }[] = [];
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
          csrf: "network-csrf",
          maintenance: false,
        },
      });
    if (path.endsWith("/resources"))
      return route.fulfill({
        json: [
          resource("server", "server", "Test server"),
          ...(removed
            ? []
            : [
                resource("network/one", "network", "Managed test network", {
                  managed: true,
                  dockerId: "managed",
                  serverId: "server",
                  status: "ready",
                }),
              ]),
        ],
      });
    if (path === "/api/v1/servers/server/networks")
      return route.fulfill({
        json: [
          ...(removed
            ? []
            : [
                docker("managed", "managed-bridge", {
                  "shipyard.network": "network/one",
                }),
              ]),
          docker("external", "external-bridge"),
        ],
      });
    if (
      path === "/api/v1/resources/network%2Fone" &&
      request.method() === "DELETE"
    ) {
      expect(request.headers()["x-csrf-token"]).toBe("network-csrf");
      writes.push({ path, method: request.method(), body: request.postData() });
      await gate;
      if (reject)
        return route.fulfill({
          status: 409,
          json: { error: "Network still has attached containers" },
        });
      removed = true;
      return route.fulfill({ status: 202, json: { ok: true } });
    }
    throw new Error(
      "Unexpected network request: " + request.method() + " " + path,
    );
  });
  try {
    await page.goto("/networks");
    await page.getByRole("combobox").click();
    await page
      .getByRole("option", { name: "Test server", exact: true })
      .click();
    const row = page
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: /Managed test network|managed-bridge/ });
    const external = page
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "external-bridge" });
    await expect(row).toHaveCount(1);
    await expect(external).toHaveCount(1);
    await row
      .getByRole("button", { name: "Delete network", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(external).toHaveCount(1);
    await expect(
      dialog.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByText("Network still has attached containers", { exact: true }),
    ).toHaveCount(1);
    await expect(row).toHaveCount(1);
    await expect(
      dialog.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeEnabled();
    reject = false;
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(0);
    await expect(external).toHaveCount(1);
    expect(writes).toEqual(
      Array(2).fill({
        path: "/api/v1/resources/network%2Fone",
        method: "DELETE",
        body: "{}",
      }),
    );
  } finally {
    release();
  }
});
