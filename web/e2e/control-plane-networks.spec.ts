import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

for (const admin of [true, false]) {
  test(`control-plane network attachment lifecycle (${admin ? "administrator" : "viewer"})`, async ({
    page,
  }) => {
    function resource(id: string, kind: string, data: Record<string, unknown>) {
      return {
        id,
        kind,
        name: id,
        data,
        parentId: "",
        teamId: "team",
        variables: {},
        secretKeys: [],
        canWrite: admin,
        version: 1,
        createdAt: "2026-10-25T00:00:00Z",
        updatedAt: "2026-10-25T00:00:00Z",
      };
    }
    let state = {
      networkId: "proxy-network",
      desired: false,
      attached: false,
      error: "",
    };
    let reject = true;
    let releaseCallback: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseCallback = resolve;
    });
    const writes: unknown[] = [];
    let reads = 0;
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
              name: "User",
              email: "user@example.test",
              admin,
              totp: false,
            },
            csrf: "network-csrf",
            maintenance: false,
          },
        });
      if (path.endsWith("/resources"))
        return route.fulfill({
          json: [
            resource("local", "server", { connection: "local" }),
            resource("remote", "server", { connection: "ssh" }),
            resource("proxy-network", "network", {
              serverId: "local",
              status: "ready",
              managed: true,
            }),
            resource("remote-network", "network", {
              serverId: "remote",
              status: "ready",
              managed: true,
            }),
            resource("ingress-network", "network", {
              serverId: "local",
              status: "ready",
              managed: true,
              ingressApp: "proxy",
            }),
          ],
        });
      if (path.endsWith("/settings/control-plane-networks")) {
        reads++;
        return route.fulfill({ json: { available: true, networks: [state] } });
      }
      if (
        path.endsWith("/networks/proxy-network/control-plane") &&
        request.method() === "PUT"
      ) {
        expect(request.headers()["x-csrf-token"]).toBe("network-csrf");
        const body: unknown = request.postDataJSON();
        writes.push(body);
        await gate;
        expect(body).toEqual({ attached: writes.length < 3 });
        state = {
          networkId: "proxy-network",
          desired: writes.length < 3,
          attached: !reject && writes.length < 3,
          error: reject ? "Temporary Docker failure" : "",
        };
        return route.fulfill({ json: state });
      }
      throw new Error(`Unexpected request: ${request.method()} ${path}`);
    });
    await page.goto("/networks");
    const row = page.getByRole("row").filter({ hasText: "proxy-network" });
    await expect(row).toBeVisible();
    for (const name of ["remote-network", "ingress-network"]) {
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: name })
          .getByRole("button", { name: "Attach Shipyard" }),
      ).toHaveCount(0);
    }
    if (!admin) {
      await expect(
        page.getByRole("button", { name: "Attach Shipyard" }),
      ).toHaveCount(0);
      expect(reads).toBe(0);
      return;
    }
    await row
      .getByRole("button", { name: "Attach Shipyard", exact: true })
      .click();
    await expect(
      row.getByRole("button", { name: "Attach Shipyard", exact: true }),
    ).toBeDisabled();
    await expect(row.getByText("Detached", { exact: true })).toBeVisible();
    releaseCallback?.();
    await expect(
      row.getByText("Temporary Docker failure", { exact: true }),
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: "Delete network", exact: true }),
    ).toBeDisabled();
    reject = false;
    await row
      .getByRole("button", { name: "Retry attachment", exact: true })
      .click();
    await expect(row.getByText("Attached", { exact: true })).toBeVisible();
    await page.reload();
    await expect(row.getByText("Attached", { exact: true })).toBeVisible();
    await row
      .getByRole("button", { name: "Detach Shipyard", exact: true })
      .click();
    await expect(row.getByText("Detached", { exact: true })).toBeVisible();
    expect(writes).toEqual([
      { attached: true },
      { attached: true },
      { attached: false },
    ]);
    await expect(
      row.getByRole("button", { name: "Delete network", exact: true }),
    ).toBeEnabled();
  });
}
