import { describe, expect, it } from "vitest";

import { parseResourceForm } from "./resource-form";
describe("dashboard form validation", () => {
  it("validates registry authorities and keeps credentials out of public data", () => {
    const input = {
      kind: "registry" as const,
      name: "Images",
      parentId: "",
      teamId: "",
      version: 0,
      data: { hostname: "ghcr.io:443", username: "alice" },
      secrets: { password: "token" },
    };
    const parsed = parseResourceForm(input);
    expect(parsed.data).toEqual(input.data);
    expect(parsed.secrets.password).toBe("token");
    for (const hostname of [
      "https://ghcr.io",
      "ghcr.io/team/app",
      "user@ghcr.io",
      "ghcr.io:65536",
      "",
    ])
      expect(() =>
        parseResourceForm({ ...input, data: { ...input.data, hostname } }),
      ).toThrow();
    expect(() =>
      parseResourceForm({ ...input, data: { ...input.data, username: "" } }),
    ).toThrow();
  });
  it("normalizes resource JSON and CSV fields and rejects invalid JSON", () => {
    const input = {
      kind: "application" as const,
      name: "app",
      parentId: "environment",
      teamId: "",
      data: {
        source: "git",
        branch: "main",
        buildArgs: '{"MODE":"release"}',
        profiles: "api, worker",
      },
      secrets: {},
      version: 0,
    };
    const parsed = parseResourceForm(input);
    expect(parsed.data.buildArgs).toEqual({ MODE: "release" });
    expect(parsed.data.profiles).toEqual(["api", "worker"]);
    expect(() =>
      parseResourceForm({ ...input, data: { ...input.data, buildArgs: "{" } }),
    ).toThrow();
    expect(() =>
      parseResourceForm({ ...input, data: { ...input.data, branch: "" } }),
    ).toThrow();
  });
});
