import type { Page } from "@playwright/test";

import { expect, test } from "@playwright/test";

import { jsonObject } from "./json";

function resource(id: string, kind: string, parentId = "") {
  return {
    id,
    kind,
    name: kind === "project" ? "Customer platform" : "Test team",
    parentId,
    teamId: "team/one",
    data: {},
    secretKeys: [],
    variables: {},
    canWrite: true,
    version: 1,
    createdAt: "2026-10-19T00:00:00Z",
    updatedAt: "2026-10-19T00:00:00Z",
  };
}
async function setup(page: Page) {
  const requests: {
    path: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  let members = [
    {
      id: "actor",
      name: "Administrator",
      email: "admin@example.test",
      role: "owner",
    },
    {
      id: "other/user",
      name: "Other User",
      email: "other@example.test",
      role: "member",
    },
  ];
  let rejectRemoval = true;
  let releaseRemoval: (() => void) | undefined;
  let removalGate: Promise<void> | undefined;
  let finishInvitationCallback: (() => void) | undefined;
  function finishInvitation() {
    finishInvitationCallback?.();
  }
  const invitationGate = new Promise<void>((resolve) => {
    finishInvitationCallback = resolve;
  });
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
            name: "Administrator",
            email: "admin@example.test",
            admin: true,
            totp: false,
          },
          csrf: "browser-csrf",
          maintenance: false,
        },
      });
    if (path.endsWith("/resources"))
      return route.fulfill({
        json: [
          resource("team/one", "team"),
          resource("project/one", "project", "team/one"),
        ],
      });
    if (request.method() !== "GET") {
      expect(request.headers()["x-csrf-token"]).toBe("browser-csrf");
      expect(request.headers()["content-type"]).toBe("application/json");
      requests.push({
        path,
        method: request.method(),
        body: jsonObject(request.postDataJSON()),
      });
    }
    if (path === "/api/v1/teams/team%2Fone/members")
      return route.fulfill({ json: members });
    if (path === "/api/v1/teams/team%2Fone/invitations") {
      await invitationGate;
      return route.fulfill({
        json: { url: "https://shipyard.test/invite?token=example" },
      });
    }
    if (path === "/api/v1/projects/project%2Fone/members")
      return route.fulfill({ json: { ok: true } });
    if (path === "/api/v1/teams/team%2Fone/members/other%2Fuser") {
      if (removalGate) await removalGate;
      if (rejectRemoval)
        return route.fulfill({
          status: 409,
          json: { error: "Membership changed. Try again." },
        });
      members = members.filter((member) => member.id !== "other/user");
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error(
      "Unexpected teams request: " + request.method() + " " + path,
    );
  });
  await page.goto("/teams");
  await expect(
    page.getByRole("heading", { name: "Teams & access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Other User" }),
  ).toBeVisible();
  return {
    requests,
    finishInvitation,
    holdRemoval() {
      removalGate = new Promise<void>((resolve) => {
        releaseRemoval = resolve;
      });
    },
    finishRemoval() {
      releaseRemoval?.();
      removalGate = undefined;
    },
    allowRemoval() {
      rejectRemoval = false;
    },
  };
}

test("teams invitations stay pending and project assignments preserve their payload", async ({
  page,
}) => {
  const fixture = await setup(page);
  try {
    await page.locator('form input[type="email"]').fill("new@example.test");
    const create = page.getByRole("button", {
      name: "Create invitation",
      exact: true,
    });
    await create.click();
    await expect(create).toBeDisabled();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Creating invitation for new@example.test" }),
    ).toBeVisible();
    await page.locator("form").evaluate((form) => {
      if (form instanceof HTMLFormElement) form.requestSubmit();
    });
    fixture.finishInvitation();
    await expect(
      page.getByText("Invitation created", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("https://shipyard.test/invite?token=example", {
        exact: true,
      }),
    ).toBeVisible();
    expect(fixture.requests).toEqual([
      {
        path: "/api/v1/teams/team%2Fone/invitations",
        method: "POST",
        body: { email: "new@example.test", role: "member", projectId: "" },
      },
    ]);
    await page
      .getByRole("row")
      .filter({ hasText: "Other User" })
      .getByRole("button", { name: "Project access" })
      .click();
    await page.getByRole("dialog").getByRole("combobox").click();
    await page.getByRole("option", { name: "operator", exact: true }).click();
    await expect(
      page.getByText("Project access updated", { exact: true }),
    ).toBeVisible();
    expect(fixture.requests.at(-1)).toEqual({
      path: "/api/v1/projects/project%2Fone/members",
      method: "POST",
      body: { userId: "other/user", role: "operator" },
    });
  } finally {
    fixture.finishInvitation();
  }
});

test("failed member removal keeps confirmation open and shows one API toast", async ({
  page,
}) => {
  const fixture = await setup(page);
  fixture.holdRemoval();
  const memberRow = page
    .getByRole("row", { includeHidden: true })
    .filter({ hasText: "Other User" });
  await page
    .getByRole("row")
    .filter({ hasText: "Other User" })
    .getByRole("button", { name: "Remove member" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(memberRow).toHaveCount(1);
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(memberRow).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeDisabled();
  fixture.finishRemoval();
  await expect(
    page.getByText("Membership changed. Try again.", { exact: true }),
  ).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await expect(memberRow).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "Confirm", exact: true }),
  ).toBeEnabled();
  fixture.allowRemoval();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Other User" }),
  ).toHaveCount(0);
  await expect(page.getByText("Member removed", { exact: true })).toBeVisible();
  expect(fixture.requests).toEqual(
    Array(2).fill({
      path: "/api/v1/teams/team%2Fone/members/other%2Fuser",
      method: "DELETE",
      body: {},
    }),
  );
});
