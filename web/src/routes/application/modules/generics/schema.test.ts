import { describe, expect, it } from "vitest";

import { logMessageSchema, logStatusSchema } from "./schema";

describe("stream JSON boundaries", () => {
  it("accepts fixed messages and final deployment state", () => {
    expect(logMessageSchema.parse('{"message":"ready"}')).toEqual({
      message: "ready",
    });
    expect(
      logStatusSchema.parse('{"state":"healthy","error":"","id":"deploy-1"}'),
    ).toEqual({ state: "healthy", error: "" });
  });
  it("ignores malformed JSON and incompatible messages", () => {
    for (const value of ["{", '{"message":7}', "null"])
      expect(logMessageSchema.safeParse(value).success).toBe(false);
    expect(logStatusSchema.safeParse('{"state":false}').success).toBe(false);
  });
});

import {
  composeSourceSchema,
  networkingPayloadSchema,
  previewCommitSchema,
  freshDeploySchema,
} from "./schema";
describe("dashboard form validation", () => {
  it("preserves unknown Compose fields", () => {
    const source = {
      yaml: "services:\n",
      version: 1,
      metadata: { owner: "team" },
    };
    expect(composeSourceSchema.parse(source)).toEqual(source);
  });
  it("keeps the empty Compose validation message", () => {
    const result = composeSourceSchema.safeParse({ yaml: "  \n", version: 1 });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Compose document is required.",
    ]);
  });
  it("preserves unknown networking service fields", () => {
    const payload = {
      version: 1,
      services: {
        web: {
          hostname: "app",
          connections: [],
          providerOptions: { internal: true },
        },
      },
    };
    expect(networkingPayloadSchema.parse(payload)).toEqual(payload);
  });
  it("keeps the invalid networking hostname validation message", () => {
    const result = networkingPayloadSchema.safeParse({
      version: 1,
      services: { web: { hostname: 42, connections: [] } },
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Invalid input: expected string, received number",
    ]);
  });
  it("rejects invalid DNS records, invitation emails, and commit SHAs (application)", () => {
    expect(previewCommitSchema.safeParse({ sha: "short" }).success).toBe(false);
    expect(previewCommitSchema.safeParse({ sha: "a".repeat(40) }).success).toBe(
      true,
    );
  });
  it("preserves Compose bytes while validating a nonempty document", () => {
    expect(
      composeSourceSchema.parse({ yaml: "services:\n", version: 1 }).yaml,
    ).toBe("services:\n");
    expect(
      composeSourceSchema.safeParse({ yaml: "  \n", version: 1 }).success,
    ).toBe(false);
  });
  it("requires the exact fresh deployment confirmation", () => {
    const schema = freshDeploySchema("production");
    expect(
      schema.safeParse({ fresh: true, confirmName: "production", version: 1 })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ fresh: true, confirmName: "staging", version: 1 })
        .success,
    ).toBe(false);
  });
});
