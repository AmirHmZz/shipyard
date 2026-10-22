import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { buildInfoFixture } from "./build-info";

async function jobFixture(page: Page, canWrite = true) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  let policy = {
    version: 1,
    enabled: false,
    cron: "0 2 * * *",
    timezone: "Asia/Tehran",
    timeoutSeconds: 1800,
    retries: 1,
    retryDelaySeconds: 60,
    nextDue: null,
    upcoming: ["2026-10-24T02:00:00Z"],
  };
  const base = {
    id: "finished-run",
    applicationId: "app",
    releaseId: "old-release",
    state: "succeeded",
    trigger: "manual",
    actor: "operator",
    policy,
    createdAt: "2026-10-23T00:00:00Z",
    finishedAt: "2026-10-23T00:00:01Z",
    retryAt: null,
    error: "",
    cleanupPending: false,
    attempts: [],
  };
  let runs = [base];
  function resource(id: string, kind: string, parentId = "", data = {}) {
    return {
      id,
      kind,
      parentId,
      name: id,
      data,
      version: 1,
      teamId: "team",
      variables: {},
      secretKeys: [],
      canWrite,
      createdAt: "2026-10-23T00:00:00Z",
      updatedAt: "2026-10-23T00:00:00Z",
    };
  }
  const app = resource("app", "application", "environment", {
    workload: "job",
    source: "compose",
    engine: "compose",
    jobService: "task",
    serverId: "server",
    context: ".",
    file: "compose.yaml",
  });
  await page.route("**/api/v1/**", async function api(route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/version"))
      return route.fulfill({ json: buildInfoFixture });
    if (path.endsWith("/telemetry"))
      return route.fulfill({ json: { dsn: "" } });
    if (path.endsWith("/auth/me"))
      return route.fulfill({
        json: {
          user: {
            email: "jobs@test.invalid",
            totp: false,
            id: "operator",
            name: "Operator",
            admin: canWrite,
          },
          csrf: "csrf",
        },
      });
    if (path.endsWith("/resources")) {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        writes.push({ path, body });
        return route.fulfill({
          json: { ...app, name: body.name, data: body.data },
        });
      }
      return route.fulfill({
        json: [
          resource("team", "team"),
          resource("project", "project", "team"),
          resource("environment", "environment", "project"),
          resource("server", "server"),
          app,
        ],
      });
    }
    if (path.endsWith("/runtime"))
      return route.fulfill({
        json: {
          status: "prepared",
          releaseId: "current-release",
          containers: [],
          targets: [],
        },
      });
    if (path.endsWith("/job-settings")) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        writes.push({ path, body });
        if (body.version !== policy.version)
          return route.fulfill({
            status: 409,
            json: { error: "Job settings changed; reload before saving" },
          });
        policy = { ...policy, ...body, version: policy.version + 1 };
      }
      return route.fulfill({
        json: {
          ...policy,
          cron: url.searchParams.get("cron") || policy.cron,
          timezone: url.searchParams.get("timezone") || policy.timezone,
        },
      });
    }
    if (path.endsWith("/runs")) {
      if (request.method() === "POST") {
        writes.push({ path, body: request.postDataJSON() });
        runs = [
          {
            ...base,
            id: "new-run",
            releaseId: "current-release",
            state: "queued",
            finishedAt: "",
            cleanupPending: true,
          },
          ...runs,
        ];
        return route.fulfill({ status: 202, json: runs[0] });
      }
      return route.fulfill({
        json: {
          items: runs,
          nextCursor: "",
          activeRun:
            runs.find(function active(run) {
              return ["queued", "running", "retry_wait", "cancelling"].includes(
                run.state,
              );
            }) || null,
        },
      });
    }
    if (path.endsWith("/cancel")) {
      writes.push({ path, body: {} });
      runs = runs.map(function cancel(run) {
        return run.id === path.split("/").at(-2)
          ? { ...run, state: "cancelled", cleanupPending: false }
          : run;
      });
      return route.fulfill({ json: runs[0] });
    }
    if (path.endsWith("/events"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: `id: 1\nevent: log\ndata: {"message":"job output [REDACTED]"}\n\nevent: status\ndata: {"state":"succeeded","cleanupPending":false}\n\n`,
      });
    if (path.includes("/runs/"))
      return route.fulfill({
        json: runs.find(function selected(run) {
          return run.id === path.split("/").at(-1);
        }),
      });
    if (
      path.endsWith("/deployments") ||
      path.endsWith("/metrics") ||
      path.endsWith("/releases")
    )
      return route.fulfill({ json: [] });
    if (path.endsWith("/compose"))
      return route.fulfill({
        json: {
          version: 1,
          yaml: "services:\n  task:\n    image: busybox:1.37.0\n",
        },
      });
    if (path.endsWith("/services"))
      return route.fulfill({
        json: [{ name: "task", replicas: 1, ignoredPorts: false }],
      });
    throw new Error(`Unexpected API ${request.method()} ${path}`);
  });
  return {
    writes,
    bumpVersion: function bump() {
      policy.version++;
    },
  };
}

test("Jobs show prepared status and hide service-only controls", async function overview({
  page,
}) {
  await jobFixture(page);
  await page.goto("/applications/app");
  await expect(page.getByText("Job overview", { exact: true })).toBeVisible();
  await expect(page.getByText("prepared", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^runs$/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^domains$/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Application actions" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Fresh deploy" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Restart", exact: true }),
  ).toHaveCount(0);
});
test("create a Compose Job with explicit target and no readiness controls", async function creation({
  page,
}) {
  const fixture = await jobFixture(page);
  await page.goto("/configure/application/new?parent=environment");
  await page.getByLabel("Name", { exact: true }).fill("Nightly job");
  await page
    .getByRole("combobox", { name: "Select Workload", exact: true })
    .click();
  await page.getByRole("option", { name: "Job", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Select Source", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Direct Compose", exact: true })
    .click();
  await page.getByLabel("Job target service", { exact: true }).fill("task");
  await page
    .getByRole("combobox", { name: "Select server", exact: true })
    .click();
  await page.getByRole("option", { name: "server", exact: true }).click();
  await expect(
    page.getByRole("combobox", {
      name: "Select Readiness policy",
      exact: true,
    }),
  ).toHaveCount(0);
  const editor = page.getByRole("textbox", {
    name: "Compose YAML",
    exact: true,
  });
  await editor.focus();
  await editor.press("ControlOrMeta+a");
  await editor.press("Backspace");
  await editor.evaluate(function paste(node) {
    const data = new DataTransfer();
    data.setData(
      "text/plain",
      "services:\n  task:\n    image: busybox:1.37.0\n    command: [echo, done]\n",
    );
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page).toHaveURL(/applications\/app$/);
  expect(fixture.writes[0].body).toMatchObject({
    data: {
      workload: "job",
      source: "compose",
      jobService: "task",
      previews: false,
      readinessChecks: [],
    },
  });
});
test("Job runs use current release, prevent overlap, cancel, and replay logs", async function executions({
  page,
}) {
  const fixture = await jobFixture(page);
  await page.goto("/applications/app?tab=runs");
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await expect(page.getByText("Run new-run", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run now", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("job output [REDACTED]", { exact: false }),
  ).toBeVisible();
  expect(fixture.writes[0].body).toEqual({
    idempotencyKey: expect.any(String),
  });
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run now", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("current-release", { exact: true }),
  ).toBeVisible();
});
test("Job schedule previews timezone and saves bounded policy", async function schedule({
  page,
}) {
  const fixture = await jobFixture(page);
  await page.goto("/applications/app?tab=schedule");
  await page
    .getByRole("textbox", { name: "Cron expression" })
    .fill("*/15 * * * *");
  await page
    .getByRole("textbox", { name: "Timezone", exact: true })
    .fill("UTC");
  await page.getByRole("spinbutton", { name: "Additional retries" }).fill("2");
  await page.getByRole("button", { name: "Preview schedule" }).click();
  await expect(
    page.getByText("Upcoming occurrences (UTC)", { exact: true }),
  ).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "Save job settings" }).click();
  await expect(
    page.getByText("Job settings saved", { exact: true }),
  ).toBeVisible();
  expect(fixture.writes[0].body).toMatchObject({
    version: 1,
    cron: "*/15 * * * *",
    timezone: "UTC",
    retries: 2,
  });
  fixture.bumpVersion();
  await page.getByRole("button", { name: "Save job settings" }).click();
  await expect(
    page.getByText("Job settings changed; reload before saving", {
      exact: false,
    }),
  ).toBeVisible();
});
test("Job viewers can inspect runs but cannot execute or change policy", async function permissions({
  page,
}) {
  const fixture = await jobFixture(page, false);
  await page.goto("/applications/app?tab=runs");
  await expect(
    page.getByRole("button", { name: "Run now", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Run again", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: /^schedule$/i }).click();
  await expect(
    page.getByRole("button", { name: "Save job settings" }),
  ).toBeDisabled();
  expect(fixture.writes).toHaveLength(0);
});
