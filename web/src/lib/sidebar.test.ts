import { afterEach, expect, it, vi } from "vitest";

import { buildInfoResponseSchema } from "@/lib/schemas/build-info";
import { contractFixtures } from "@/test/api-contract-fixtures";

import {
  formatBuildVersion,
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "./sidebar";

afterEach(() => vi.unstubAllGlobals());

it("persists the icon-rail preference and defaults to expanded", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  expect(readSidebarCollapsed()).toBe(false);
  writeSidebarCollapsed(true);
  expect(readSidebarCollapsed()).toBe(true);
  writeSidebarCollapsed(false);
  expect(readSidebarCollapsed()).toBe(false);
});

it("works when storage is unavailable", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("disabled");
    },
    setItem: () => {
      throw new Error("disabled");
    },
  });
  expect(readSidebarCollapsed()).toBe(false);
  expect(() => writeSidebarCollapsed(true)).not.toThrow();
});

it.each(contractFixtures("BuildInfo"))(
  "displays the backend identity from $name",
  ({ body, name }) => {
    const info = buildInfoResponseSchema.parse(body);
    expect(formatBuildVersion(info.version)).toBe(
      name === "build-dev" ? "dev" : "v9.8.7",
    );
    expect(formatBuildVersion(undefined)).toBe("");
  },
);
