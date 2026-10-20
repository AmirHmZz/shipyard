import type { Page } from "@playwright/test";

import { test, expect } from "@playwright/test";
async function setup(
  page: Page,
  {
    admin = true,
    destructive = false,
    enabled = true,
    notes = "Fix deployment recovery",
  } = {},
) {
  const target = {
    version: "0.1.0",
    previous: "",
    notes,
    schema: 3,
  };
  const current = { version: "0.2.0", previous: target.version, schema: 4 };
  const state: {
    operation?: { state: string; backup?: string; [key: string]: unknown };
    [key: string]: unknown;
  } = {
    enabled,
    version: { version: "0.2.0", commit: "abc123", architecture: "amd64" },
    installation: { release: current },
    releases: [target],
  };
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let disconnected = false;
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: {
            email: "user@example.test",
            totp: false,
            id: "admin",
            name: "Admin",
            admin,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources") || path.endsWith("/metrics"))
      return route.fulfill({ json: [] });
    if (path.endsWith("/backup"))
      return route.fulfill({
        body: "encrypted",
        headers: { "content-type": "application/octet-stream" },
      });
    if (path.includes("/settings/updates")) {
      if (req.method() === "GET") {
        if (disconnected) return route.abort();
        return route.fulfill({ json: state });
      }
      const body = req.postDataJSON();
      writes.push({ path, body });
      if (path.endsWith("/check")) return route.fulfill({ json: state });
      if (path.endsWith("/plan"))
        return route.fulfill({
          json: {
            id: "plan",
            revision: 1,
            current,
            target,
            expires: new Date(Date.now() + 600000).toISOString(),
            destructive,
            migrations: {
              current: 4,
              target: 3,
              steps: destructive
                ? [
                    {
                      version: 4,
                      direction: "down",
                      checksum: "abc",
                      classification: "destructive",
                      impact: "Discard feature settings",
                    },
                  ]
                : [],
            },
          },
        });
      state.operation = {
        id: "op",
        state: "waiting",
        plan: { target },
        backup: "",
      };
      return route.fulfill({ status: 202, json: state.operation });
    }
    throw Error("Unexpected API " + path);
  });
  return {
    state,
    writes,
    disconnect: (v: boolean) => {
      disconnected = v;
    },
  };
}
for (const theme of ["light", "dark"]) {
  test.describe(theme, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (t) => localStorage.setItem("shipyard-theme", t),
        theme,
      );
    });
    test("version plans require encrypted backup and explicit destructive approval", async ({
      page,
    }, info) => {
      const data = await setup(page, { destructive: true });
      await page.goto("/settings?tab=updates");
      await page.getByRole("button", { name: "Check for updates" }).click();
      await page.getByRole("combobox", { name: "Target version" }).click();
      await page.getByRole("option", { name: "0.1.0 (downgrade)" }).click();
      await page
        .getByRole("button", { name: "Preview version change" })
        .click();
      await expect(page.getByText("Discard feature settings")).toBeVisible();
      const apply = page.getByRole("button", { name: "Back up & apply 0.1.0" });
      await expect(apply).toBeDisabled();
      await page
        .getByLabel("Backup passphrase", { exact: true })
        .fill("fresh-backup-passphrase");
      await expect(apply).toBeDisabled();
      await page
        .getByRole("switch", { name: "I approve the listed data loss" })
        .click();
      await page.getByLabel("Type 0.1.0 to confirm").fill("0.1.0");
      await apply.click();
      expect(data.writes.at(-1)?.body).toEqual({
        planId: "plan",
        passphrase: "fresh-backup-passphrase",
        confirmation: "0.1.0",
        approveDataLoss: true,
      });
      await expect(
        page.getByLabel("Backup passphrase", { exact: true }),
      ).toHaveCount(0);
      data.disconnect(true);
      await expect(page.getByText(/Reconnecting/)).toBeVisible({
        timeout: 20000,
      });
      data.disconnect(false);
      if (!data.state.operation)
        throw new Error("Expected a pending update operation");
      data.state.operation.state = "succeeded";
      data.state.operation.backup = "backup.sybackup";
      await expect(
        page.getByRole("button", { name: "Download encrypted backup" }),
      ).toBeVisible();
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download encrypted backup" })
        .click();
      expect((await download).suggestedFilename()).toBe("shipyard-op.sybackup");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath("system-updates-" + theme + ".png"),
        fullPage: true,
      });
    });
    test("development updates are disabled", async ({ page }) => {
      await setup(page, { enabled: false });
      await page.goto("/settings?tab=updates");
      await expect(
        page.getByRole("button", { name: "Check for updates" }),
      ).toBeDisabled();
    });
    test("release notes render Markdown without executing HTML or unsafe links", async ({
      page,
    }, info) => {
      await setup(page, {
        notes: [
          "## [0.1.0](https://github.com/AmirHmZz/shipyard/releases/tag/v0.1.0)",
          "### Features",
          "* Improve **deployment recovery** with `compose up`.",
          "* Support ~~legacy~~ settings.",
          "### Bug fixes",
          "1. Fix routing.",
          "2. Preserve configuration.",
          "```sh\ncompose up --wait\n```",
          "| Change | Status |\n| --- | --- |\n| Routing | Fixed |",
          "[Unsafe link](javascript:alert('bad'))",
          "<script>window.releaseNotesExecuted = true</script>",
          '<img src="missing" onerror="window.releaseNotesExecuted = true">',
          `[Long reference](https://example.com/${"release".repeat(50)})`,
        ].join("\n\n"),
      });
      await page.goto("/settings?tab=updates");
      await page.getByRole("combobox", { name: "Target version" }).click();
      await page.getByRole("option", { name: "0.1.0 (downgrade)" }).click();
      await page
        .getByRole("button", { name: "Preview version change" })
        .click();
      const notes = page.locator(".release-notes");
      await expect(
        notes.getByRole("heading", { name: "Features" }),
      ).toBeVisible();
      await expect(
        notes.getByRole("heading", { name: "Bug fixes" }),
      ).toBeVisible();
      await expect(
        notes.getByRole("link", { name: "0.1.0", exact: true }),
      ).toHaveAttribute(
        "href",
        "https://github.com/AmirHmZz/shipyard/releases/tag/v0.1.0",
      );
      await expect(notes.locator("ul > li")).toHaveCount(2);
      await expect(notes.locator("ol > li")).toHaveCount(2);
      await expect(notes.locator("strong")).toHaveText("deployment recovery");
      await expect(notes.locator("del")).toHaveText("legacy");
      await expect(notes.locator("pre code")).toContainText(
        "compose up --wait",
      );
      await expect(notes.getByRole("table")).toBeVisible();
      await expect(
        notes.locator("a", { hasText: "Unsafe link" }),
      ).toHaveAttribute("href", "");
      await expect(notes.locator("script, img")).toHaveCount(0);
      expect(await page.evaluate(() => "releaseNotesExecuted" in window)).toBe(
        false,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`release-notes-${theme}.png`),
        fullPage: true,
      });
    });
    test("viewer cannot open system updates", async ({ page }) => {
      await setup(page, { admin: false });
      await page.goto("/settings?tab=updates");
      await expect(
        page.getByRole("tab", { name: "System updates" }),
      ).toHaveCount(0);
      await expect(page.getByLabel("Backup passphrase")).toHaveCount(0);
    });
  });
}
