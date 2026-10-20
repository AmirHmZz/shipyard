import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, post } from "@/lib/api/client";

import * as services from "./index";

vi.mock("@/lib/api/client", () => {
  const api = vi.fn();
  return {
    api,
    post: vi.fn((path: string, body: unknown = {}) =>
      api(path, { method: "POST", body: JSON.stringify(body) }),
    ),
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api).mockResolvedValue({ ok: true });
});
type Contract = {
  name: string;
  run: () => Promise<unknown>;
  request: unknown[];
  posted?: unknown[];
};
const policy: Parameters<typeof services.saveAlertPolicy>[0] = {
  cpu: 90,
  memory: 80,
  disk: 75,
  sustainedSeconds: 60,
  offlineSeconds: 120,
};

// Baseline: git show 70595bb:web/src/routes/settings/modules/components/*.tsx.
describe("settings service request contracts", () => {
  const cases: Contract[] = [
    {
      name: "applyUpdate",
      run: () =>
        services.applyUpdate({
          planId: "plan",
          passphrase: "secret",
          confirmation: "v1",
          approveDataLoss: false,
        }),
      request: [
        "/settings/updates",
        {
          method: "POST",
          body: JSON.stringify({
            planId: "plan",
            passphrase: "secret",
            confirmation: "v1",
            approveDataLoss: false,
          }),
        },
      ],
      posted: [
        "/settings/updates",
        {
          planId: "plan",
          passphrase: "secret",
          confirmation: "v1",
          approveDataLoss: false,
        },
      ],
    },
    {
      name: "changePassword",
      run: () =>
        services.changePassword({
          current: "old",
          password: "new",
          code: "123456",
        }),
      request: [
        "/auth/password",
        {
          method: "POST",
          body: JSON.stringify({
            current: "old",
            password: "new",
            code: "123456",
          }),
        },
      ],
      posted: [
        "/auth/password",
        { current: "old", password: "new", code: "123456" },
      ],
    },
    {
      name: "checkForUpdates",
      run: () => services.checkForUpdates(),
      request: [
        "/settings/updates/check",
        { method: "POST", body: JSON.stringify({}) },
      ],
      posted: ["/settings/updates/check", {}],
    },
    {
      name: "disableTOTP",
      run: () => services.disableTOTP({ password: "secret", code: "123456" }),
      request: [
        "/auth/totp/disable",
        {
          method: "POST",
          body: JSON.stringify({ password: "secret", code: "123456" }),
        },
      ],
      posted: ["/auth/totp/disable", { password: "secret", code: "123456" }],
    },
    {
      name: "downloadBackup",
      run: () => services.downloadBackup({ passphrase: "secret" }),
      request: [
        "/backup",
        { method: "POST", body: JSON.stringify({ passphrase: "secret" }) },
      ],
      posted: ["/backup", { passphrase: "secret" }],
    },
    {
      name: "enableTOTP",
      run: () => services.enableTOTP({ code: "123456" }),
      request: [
        "/auth/totp/confirm",
        { method: "POST", body: JSON.stringify({ code: "123456" }) },
      ],
      posted: ["/auth/totp/confirm", { code: "123456" }],
    },
    {
      name: "planUpdate",
      run: () => services.planUpdate({ target: "v1" }),
      request: [
        "/settings/updates/plan",
        { method: "POST", body: JSON.stringify({ target: "v1" }) },
      ],
      posted: ["/settings/updates/plan", { target: "v1" }],
    },
    {
      name: "regenerateRecoveryCodes",
      run: () => services.regenerateRecoveryCodes({ password: "secret" }),
      request: [
        "/auth/totp/start",
        { method: "POST", body: JSON.stringify({ password: "secret" }) },
      ],
      posted: ["/auth/totp/start", { password: "secret" }],
    },
    {
      name: "setMaintenanceMode",
      run: () => services.setMaintenanceMode(true),
      request: [
        "/settings/maintenance",
        { method: "POST", body: JSON.stringify({ enabled: true }) },
      ],
      posted: ["/settings/maintenance", { enabled: true }],
    },
    {
      name: "download update backup",
      run: () => services.downloadUpdateBackup("a/b?c"),
      request: ["/settings/updates/a%2Fb%3Fc/backup"],
    },
    {
      name: "alert policy",
      run: () => services.saveAlertPolicy(policy),
      request: [
        "/settings/alerts",
        { method: "PUT", body: JSON.stringify(policy) },
      ],
    },
    {
      name: "dashboard save",
      run: () =>
        services.saveDashboardAccess(false, {
          version: 3,
          domain: "dash.test",
          acmeEmail: "u@example.test",
          acceptTos: true,
        }),
      request: [
        "/settings/dashboard-access",
        {
          method: "PUT",
          body: '{"version":3,"domain":"dash.test","acmeEmail":"u@example.test","acceptTos":true}',
        },
      ],
    },
    {
      name: "dashboard retry",
      run: () => services.saveDashboardAccess(true, { version: 3 }),
      request: [
        "/settings/dashboard-access/retry",
        { method: "POST", body: '{"version":3}' },
      ],
    },
    {
      name: "update user",
      run: () =>
        services.updateUser("a/b?c", { admin: true, disabled: undefined }),
      request: ["/users/a%2Fb%3Fc", { method: "PUT", body: '{"admin":true}' }],
    },
    {
      name: "preserve undefined user",
      run: () =>
        services.updateUser(undefined, {
          admin: undefined,
          disabled: undefined,
        }),
      request: ["/users/undefined", { method: "PUT", body: "{}" }],
    },
  ];
  it.each(cases)("$name", async ({ run, request, posted }) => {
    await run();
    expect(api).toHaveBeenCalledExactlyOnceWith(...request);
    if (posted) expect(post).toHaveBeenCalledExactlyOnceWith(...posted);
    else expect(post).not.toHaveBeenCalled();
  });
});
