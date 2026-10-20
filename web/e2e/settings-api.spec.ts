import { expect, test } from "@playwright/test";

test("maintenance mode updates immediately, restores on failure, and retries against the server", async ({
  page,
}) => {
  let enabled = false;
  let reject = true;
  let releaseCallback: (() => void) | undefined;
  function release() {
    releaseCallback?.();
  }
  const gate = new Promise<void>((resolve) => {
    releaseCallback = resolve;
  });
  const writes: (string | null)[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
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
          csrf: "maintenance-csrf",
          maintenance: enabled,
        },
      });
    if (path.endsWith("/resources")) return route.fulfill({ json: [] });
    if (
      path === "/api/v1/settings/maintenance" &&
      request.method() === "POST"
    ) {
      expect(request.headers()["x-csrf-token"]).toBe("maintenance-csrf");
      writes.push(request.postData());
      await gate;
      if (reject)
        return route.fulfill({ status: 409, json: { error: "Mode rejected" } });
      enabled = true;
      return route.fulfill({ json: { enabled } });
    }
    throw new Error(
      "Unexpected maintenance request: " + request.method() + " " + path,
    );
  });
  try {
    await page.goto("/settings?tab=backup");
    const toggle = page.getByRole("switch");
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();
    release();
    await expect(page.getByText("Mode rejected", { exact: true })).toHaveCount(
      1,
    );
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeEnabled();
    reject = false;
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Export encrypted backup" }),
    ).toBeEnabled();
    expect(writes).toEqual(['{"enabled":true}', '{"enabled":true}']);
  } finally {
    release();
  }
});
