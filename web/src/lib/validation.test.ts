import { describe, expect, it } from "vitest";

import {
  authFormSchema,
  composeSourceSchema,
  dnsCredentialSchema,
  dnsRecordFormSchema,
  freshDeploySchema,
  invitationFormSchema,
  networkingPayloadSchema,
  parseResourceForm,
  passwordFormSchema,
  previewCommitSchema,
  serverDeletionSchema,
} from "./validation";

describe("dashboard form validation", () => {
  it("preserves unknown DNS record fields", () => {
    const record = {
      type: "A",
      name: "example.com",
      content: "192.0.2.1",
      ttl: 120,
      providerOptions: { flattened: true },
    };
    expect(dnsRecordFormSchema.parse(record)).toEqual(record);
  });

  it("keeps the DNS TTL validation message", () => {
    const result = dnsRecordFormSchema.safeParse({
      type: "A",
      name: "example.com",
      content: "192.0.2.1",
      ttl: 0,
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "TTL must be positive.",
    ]);
  });

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

  it("applies the appropriate auth requirements", () => {
    expect(
      authFormSchema("login").safeParse({
        email: "bad",
        password: "x",
        name: "",
        code: "",
        token: "",
      }).success,
    ).toBe(false);
    expect(
      authFormSchema("setup").safeParse({
        email: "admin@example.com",
        password: "short",
        name: "Admin",
        code: "",
        token: "token",
      }).success,
    ).toBe(false);
    expect(
      authFormSchema("accept").safeParse({
        email: "",
        password: "current",
        name: "New User",
        code: "",
        token: "invite",
      }).success,
    ).toBe(true);
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

  it("rejects invalid DNS records, invitation emails, and commit SHAs", () => {
    expect(
      dnsRecordFormSchema.safeParse({
        type: "A",
        name: "example.com",
        content: "",
        ttl: 120,
      }).success,
    ).toBe(false);
    expect(
      invitationFormSchema.safeParse({
        email: "invalid",
        role: "member",
        projectId: "",
      }).success,
    ).toBe(false);
    expect(previewCommitSchema.safeParse({ sha: "short" }).success).toBe(false);
    expect(previewCommitSchema.safeParse({ sha: "a".repeat(40) }).success).toBe(
      true,
    );
    expect(
      dnsCredentialSchema.safeParse({ provider: "cloudflare", token: "" })
        .success,
    ).toBe(false);
  });

  it("preserves Compose bytes while validating a nonempty document", () => {
    expect(
      composeSourceSchema.parse({ yaml: "services:\n", version: 1 }).yaml,
    ).toBe("services:\n");
    expect(
      composeSourceSchema.safeParse({ yaml: "  \n", version: 1 }).success,
    ).toBe(false);
  });

  it("preserves credential bytes across local validation", () => {
    expect(
      dnsCredentialSchema.parse({ provider: "cloudflare", token: " token " })
        .token,
    ).toBe(" token ");
    expect(
      passwordFormSchema.parse({
        current: " current ",
        password: "new-password",
        code: "",
      }).current,
    ).toBe(" current ");
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

  it("requires the exact server deletion confirmation", () => {
    const schema = serverDeletionSchema("production");
    expect(
      schema.safeParse({
        planId: "plan",
        name: "production",
        deleteVolumes: true,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ planId: "plan", name: "other", deleteVolumes: true })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        planId: "plan",
        name: "production",
        deleteVolumes: false,
      }).success,
    ).toBe(false);
  });
});
