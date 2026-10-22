import { describe, expect, it } from "vitest";

import type { Resource } from "@/lib/api/types";

import {
  httpReadinessChecksSchema,
  previewRoutingSchema,
} from "@/lib/schemas/application";

import { normalizeApplicationSettings } from "./application-settings";

function route(service: string, port: number) {
  return {
    data: { service, targetPort: port, protocol: "https" },
  } as unknown as Resource;
}
describe("application configuration compatibility", () => {
  it("preserves effective legacy checks and removes generic port fields from writes", () => {
    const result = normalizeApplicationSettings(
      { port: 8080, healthPath: "/ready" },
      [
        route("web", 8080),
        route("web", 8080),
        route("api", 8080),
        route("other", 9000),
      ],
    );
    expect(result.readinessChecks).toEqual([
      { service: "web", port: 8080, path: "/ready" },
      { service: "api", port: 8080, path: "/ready" },
    ]);
    expect(result).not.toHaveProperty("port");
    expect(result).not.toHaveProperty("healthPath");
    expect(result.previewRouting).toEqual({ mode: "inherit" });
  });
  it("honors explicit empty checks and private previews over legacy defaults", () => {
    expect(
      normalizeApplicationSettings(
        {
          port: 3000,
          healthPath: "/",
          readinessChecks: [],
          previewRouting: { mode: "private" },
        },
        [route("app", 3000)],
      ),
    ).toEqual({ readinessChecks: [], previewRouting: { mode: "private" } });
    expect(
      normalizeApplicationSettings({ port: 3000 }, []).previewRouting,
    ).toEqual({ mode: "target", service: "app", port: 3000 });
  });
  it("validates check boundaries and explicit preview targets", () => {
    expect(
      httpReadinessChecksSchema.safeParse([
        { service: "db", port: 0, path: "/" },
      ]).success,
    ).toBe(false);
    expect(
      httpReadinessChecksSchema.safeParse([
        { service: "db", port: 8123, path: "ready" },
      ]).success,
    ).toBe(false);
    expect(
      httpReadinessChecksSchema.safeParse([
        { service: "db", port: 8123, path: "/ready" },
      ]).success,
    ).toBe(true);
    expect(
      previewRoutingSchema.safeParse({
        mode: "target",
        service: "app",
        port: 65536,
      }).success,
    ).toBe(false);
    expect(previewRoutingSchema.safeParse({ mode: "private" }).success).toBe(
      true,
    );
  });
});
