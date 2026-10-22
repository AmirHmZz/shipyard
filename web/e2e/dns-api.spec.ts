import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

async function fixture(page: Page) {
  let records = [
    {
      id: "record/one",
      type: "A",
      name: "api.example.test",
      content: "192.0.2.1",
      ttl: 120,
      proxied: false,
    },
  ];
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
          csrf: "dns-csrf",
          maintenance: false,
        },
      });
    if (path.endsWith("/resources"))
      return route.fulfill({
        json: [
          {
            id: "zone",
            kind: "zone",
            name: "example.test",
            data: { domain: "example.test" },
            parentId: "provider",
            teamId: "team",
            variables: {},
            secretKeys: [],
            canWrite: true,
            version: 1,
            createdAt: "2026-10-20T00:00:00Z",
            updatedAt: "2026-10-20T00:00:00Z",
          },
        ],
      });
    if (request.method() !== "GET") {
      expect(request.headers()["x-csrf-token"]).toBe("dns-csrf");
      writes.push({ path, method: request.method(), body: request.postData() });
    }
    if (path === "/api/v1/zones/zone/records" && request.method() === "GET")
      return route.fulfill({ json: records });
    if (
      path === "/api/v1/zones/zone/records/record%2Fone" &&
      request.method() === "DELETE"
    ) {
      await gate;
      if (reject)
        return route.fulfill({
          status: 409,
          json: { error: "Provider rejected removal" },
        });
      records = [];
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/v1/zones/zone/records" && request.method() === "POST") {
      await gate;
      return route.fulfill({
        json: {
          id: "new-record",
          type: "A",
          name: "example.test",
          content: "192.0.2.9",
          ttl: 120,
          proxied: false,
        },
      });
    }
    throw new Error("Unexpected DNS request: " + request.method() + " " + path);
  });
  return {
    writes,
    release() {
      release();
    },
    allowRemoval() {
      reject = false;
    },
  };
}

test("DNS removal disappears before the response, rolls back once, and can be retried", async ({
  page,
}) => {
  const state = await fixture(page);
  try {
    await page.goto("/dns/zone");
    const row = page
      .getByRole("row", { includeHidden: true })
      .filter({ hasText: "api.example.test" });
    await row.getByRole("button", { name: "Delete DNS record" }).click();
    const dialog = page.getByRole("dialog");
    await expect(row).toHaveCount(1);
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(row).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeDisabled();
    state.release();
    await expect(
      page.getByText("Provider rejected removal", { exact: true }),
    ).toHaveCount(1);
    await expect(row).toHaveCount(1);
    await expect(
      dialog.getByRole("button", { name: "Confirm", exact: true }),
    ).toBeEnabled();
    state.allowRemoval();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveCount(0);
    expect(state.writes).toEqual(
      Array(2).fill({
        path: "/api/v1/zones/zone/records/record%2Fone",
        method: "DELETE",
        body: "{}",
      }),
    );
  } finally {
    state.release();
  }
});

test("a new DNS record shows its submitted values while saving", async ({
  page,
}) => {
  const state = await fixture(page);
  try {
    await page.goto("/dns/zone/records/new");
    await page.locator("form input").nth(1).fill("192.0.2.9");
    const save = page.getByRole("button", { name: "Save record", exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Saving A record example.test" }),
    ).toBeVisible();
    await page.locator("form").evaluate((form) => {
      if (form instanceof HTMLFormElement) form.requestSubmit();
    });
    state.release();
    await expect(page).toHaveURL(/\/dns\/zone$/);
    await expect(
      page.getByText("DNS record saved", { exact: true }),
    ).toHaveCount(1);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toEqual({
      path: "/api/v1/zones/zone/records",
      method: "POST",
      body: '{"type":"A","name":"example.test","content":"192.0.2.9","ttl":120,"proxied":false}',
    });
  } finally {
    state.release();
  }
});
