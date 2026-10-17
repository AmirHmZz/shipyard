import { expect, test } from "@playwright/test";

test("browser errors use the runtime DSN without session or URL tokens", async ({
  page,
  baseURL,
}) => {
  const envelopes: string[] = [];
  const collector = new URL("/1", baseURL!);
  collector.username = "public";
  // Use an allowed same-origin collector under the packaged service's CSP.
  await page.route(`${collector.origin}/api/1/envelope/**`, async (route) => {
    envelopes.push(route.request().postData() || "");
    await route.fulfill({
      json: {},
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({
        json: {
          dsn: collector.href,
          environment: "browser-test",
          release: "synthetic",
        },
      });
    if (path.endsWith("/auth/status"))
      return route.fulfill({ json: { setupRequired: false } });
    return route.fulfill({ status: 401, json: { error: "Not signed in" } });
  });
  await page.goto("/login?csrf=private-query");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    console.log("private-console-output");
    setTimeout(() => {
      throw new Error("Synthetic browser reporting check");
    }, 0);
  });
  await expect
    .poll(() =>
      envelopes.some((payload) =>
        payload.includes("Synthetic browser reporting check"),
      ),
    )
    .toBeTruthy();
  const payload = envelopes.join("\n");
  expect(payload).toContain("browser-test");
  expect(payload).not.toContain("private-query");
  expect(payload).not.toContain("private-console-output");
});
