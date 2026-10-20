import { describe, expect, it } from "vitest";

import { parseResourceForm } from "./resource-form";
describe("dashboard form validation", () => {
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
