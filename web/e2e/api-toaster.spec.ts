import { expect, test } from "@playwright/test";

test("sign-in API errors are visible in the provider toaster", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    if (path.endsWith("/auth/status"))
      return route.fulfill({
        json: { setupEnabled: false, setupRequired: false },
      });
    if (path.endsWith("/auth/login")) {
      expect(request.method()).toBe("POST");
      expect(request.postDataJSON()).toMatchObject({
        email: "admin@shipyard.test",
        password: "wrong-password",
      });
      return route.fulfill({
        status: 401,
        json: { error: "Invalid credentials" },
      });
    }
    throw new Error("Unexpected sign-in request: " + path);
  });
  await page.goto("/");
  await page.getByLabel("Email address").fill("admin@shipyard.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Invalid credentials", { exact: true }),
  ).toBeVisible();
});
