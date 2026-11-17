// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Resource } from "@/lib/api/types";

import { setCSRF } from "@/lib/api/csrf";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { automationKeys, resourceLimitKeys } from "../generics/automation";
import { ApplicationAutomation } from "./ApplicationAutomation";
import { ApplicationResourceLimits } from "./ApplicationResourceLimits";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/telemetry", () => ({ reportError: vi.fn() }));
const app: Resource = {
  id: "app",
  kind: "application",
  name: "App",
  data: { engine: "dockerfile" },
  version: 1,
  parentId: "",
  teamId: "team",
  variables: {},
  secretKeys: [],
  canWrite: true,
  createdAt: "2026-11-15",
  updatedAt: "2026-11-15",
};
afterEach(function reset() {
  cleanup();
  vi.unstubAllGlobals();
});

describe("application settings drafts", function () {
  it.each([60, 62, 3599, 3600, 86399, 86400, 31535999, 31536000])(
    "preserves a saved %i-second interval when editing schedules",
    async function (seconds) {
      const client = createTestClient();
      const policy = {
        version: 1,
        restarts: [{ service: "app", enabled: true, intervalSeconds: seconds }],
        rules: [],
        lastAction: "",
        lastAt: null,
        lastResult: "",
        lastError: "",
        upcoming: {},
        restartStatus: [],
      };
      const writes: unknown[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async function fetchSettings(
          input: string | URL | Request,
          init?: RequestInit,
        ) {
          if (String(input).endsWith("/services"))
            return Response.json([
              { name: "app", replicas: 1, ignoredPorts: false },
            ]);
          if (init?.method === "PUT") {
            writes.push(JSON.parse(String(init.body)));
            return Response.json({ ...policy, version: 2 });
          }
          return Response.json(policy);
        }),
      );
      render(<ApplicationAutomation app={app} />, renderWithClient(client));
      await screen.findByRole("spinbutton", { name: "app restart interval" });
      fireEvent.click(
        screen.getByRole("button", { name: "Add schedule rule" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
      await waitFor(function saved() {
        expect(writes).toHaveLength(1);
      });
      expect(writes[0]).toMatchObject({
        restarts: [{ service: "app", enabled: true, intervalSeconds: seconds }],
        rules: [{ action: "start" }],
      });
      client.clear();
    },
  );
  it.each(["1.001", "0.99", "525601"])(
    "rejects a fractional or out-of-range interval of %s minutes",
    async function (value) {
      const client = createTestClient();
      const writes: unknown[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async function fetchSettings(
          input: string | URL | Request,
          init?: RequestInit,
        ) {
          if (String(input).endsWith("/services"))
            return Response.json([
              { name: "app", replicas: 1, ignoredPorts: false },
            ]);
          if (init?.method === "PUT") writes.push(init.body);
          return Response.json({
            version: 1,
            restarts: [{ service: "app", enabled: true, intervalSeconds: 60 }],
            rules: [],
            lastAction: "",
            lastAt: null,
            lastResult: "",
            lastError: "",
            upcoming: {},
            restartStatus: [],
          });
        }),
      );
      render(<ApplicationAutomation app={app} />, renderWithClient(client));
      const interval = await screen.findByRole("spinbutton", {
        name: "app restart interval",
      });
      fireEvent.change(interval, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
      expect(writes).toHaveLength(0);
      client.clear();
    },
  );
  it("preserves unsaved automation across background refresh and keeps its original version", async function () {
    const client = createTestClient();
    setCSRF("csrf");
    let policy = {
      version: 1,
      restarts: [{ service: "app", enabled: true, intervalSeconds: 300 }],
      rules: [],
      lastAction: "",
      lastAt: null,
      lastResult: "",
      lastError: "",
      upcoming: {},
      restartStatus: [],
    };
    const writes: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async function fetchSettings(
        input: string | URL | Request,
        init?: RequestInit,
      ) {
        if (String(input).endsWith("/services"))
          return Response.json([
            { name: "app", replicas: 1, ignoredPorts: false },
          ]);
        if (init?.method === "PUT") {
          writes.push(JSON.parse(String(init.body)));
          return Response.json(
            { error: "Automation settings changed; reload before saving" },
            { status: 409 },
          );
        }
        return Response.json(policy);
      }),
    );
    render(<ApplicationAutomation app={app} />, renderWithClient(client));
    const interval = await screen.findByRole("spinbutton", {
      name: "app restart interval",
    });
    fireEvent.change(interval, { target: { value: "15" } });
    policy = {
      ...policy,
      version: 2,
      restarts: [{ service: "app", enabled: true, intervalSeconds: 600 }],
    };
    await act(async function refresh() {
      await client.invalidateQueries({
        queryKey: automationKeys.settings(app.id),
      });
    });
    expect(
      screen.getByRole("spinbutton", { name: "app restart interval" }),
    ).toHaveProperty("value", "15");
    expect(await screen.findByText(/Your draft is preserved/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));
    await waitFor(function saved() {
      expect(writes).toHaveLength(1);
    });
    expect(writes[0]).toMatchObject({
      version: 1,
      restarts: [{ service: "app", enabled: true, intervalSeconds: 900 }],
    });
    await waitFor(function enabled() {
      expect(
        screen.getByRole("button", { name: "Reload saved settings" }),
      ).toHaveProperty("disabled", false);
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Reload saved settings" }),
    );
    expect(
      screen.getByRole("spinbutton", { name: "app restart interval" }),
    ).toHaveProperty("value", "10");
    client.clear();
  });
  it("preserves resource limit drafts until the user explicitly reloads", async function () {
    const client = createTestClient();
    let limits = {
      version: 1,
      services: { app: { cpus: 0.5 } },
      applied: {},
      pending: true,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async function fetchSettings(input: string | URL | Request) {
        return Response.json(
          String(input).endsWith("/services")
            ? [{ name: "app", replicas: 1, ignoredPorts: false }]
            : limits,
        );
      }),
    );
    render(<ApplicationResourceLimits app={app} />, renderWithClient(client));
    const cpu = await screen.findByRole("spinbutton", {
      name: "app CPU limit",
    });
    fireEvent.change(cpu, { target: { value: "0.75" } });
    limits = { ...limits, version: 2, services: { app: { cpus: 1.5 } } };
    await act(async function refresh() {
      await client.invalidateQueries({
        queryKey: resourceLimitKeys.all(app.id),
      });
    });
    expect(
      screen.getByRole("spinbutton", { name: "app CPU limit" }),
    ).toHaveProperty("value", "0.75");
    fireEvent.click(
      await screen.findByRole("button", { name: "Reload saved settings" }),
    );
    expect(
      screen.getByRole("spinbutton", { name: "app CPU limit" }),
    ).toHaveProperty("value", "1.5");
    client.clear();
  });
});
