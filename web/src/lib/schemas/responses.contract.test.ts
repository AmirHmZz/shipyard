import { describe, expect, it } from "vitest";

import { deploymentResponseSchema } from "./deployments";
import { dnsRecordResponseSchema } from "./dns";
import { metricResponseSchema } from "./metrics";
import { resourceResponseSchema } from "./resources";
import { sessionResponseSchema } from "./session";

describe("shared response boundaries", () => {
  const resource = {
    id: "project-1",
    kind: "project",
    name: "Demo",
    teamId: "team-1",
    parentId: "team-1",
    data: {},
    variables: {},
    secretKeys: [],
    canWrite: true,
    version: 1,
    createdAt: "2026-10-19T00:00:00Z",
    updatedAt: "2026-10-19T00:00:00Z",
  };
  it("preserves opaque resource data and strips added backend metadata", () => {
    const data = { nested: { enabled: true }, port: 8080 };
    expect(
      resourceResponseSchema.parse({ ...resource, data, newMetadata: true }),
    ).toEqual({ ...resource, data });
    expect(
      resourceResponseSchema.safeParse({ ...resource, variables: null })
        .success,
    ).toBe(false);
    expect(
      resourceResponseSchema.safeParse({ ...resource, version: "1" }).success,
    ).toBe(false);
  });
  it("rejects incomplete sessions and does not coerce booleans", () => {
    const session = {
      user: {
        id: "user-1",
        email: "a@example.com",
        name: "A",
        admin: true,
        totp: false,
      },
      csrf: "token",
    };
    expect(sessionResponseSchema.parse(session)).toEqual(session);
    expect(
      sessionResponseSchema.safeParse({
        ...session,
        user: { ...session.user, admin: "false" },
      }).success,
    ).toBe(false);
    expect(
      sessionResponseSchema.safeParse({ user: session.user }).success,
    ).toBe(false);
  });
  it("accepts deployment deletion flags while requiring the persisted state", () => {
    const deployment = {
      id: "deploy-1",
      applicationId: "app-1",
      state: "healthy",
      phase: "done",
      commit: "abc",
      error: "",
      releaseId: "",
      rollbackId: "",
      createdAt: "2026-10-19T00:00:00Z",
      updatedAt: "2026-10-19T00:00:00Z",
      deleting: true,
    };
    expect(deploymentResponseSchema.parse(deployment)).toEqual(deployment);
    expect(
      deploymentResponseSchema.safeParse({ ...deployment, state: null })
        .success,
    ).toBe(false);
  });
  it("validates provider records without losing structured provider data", () => {
    const record = {
      type: "A",
      name: "app.example.com",
      content: "192.0.2.1",
      ttl: 300,
      proxied: false,
      data: { weight: 5 },
    };
    expect(dnsRecordResponseSchema.parse(record)).toEqual(record);
    expect(
      dnsRecordResponseSchema.safeParse({ ...record, ttl: "300" }).success,
    ).toBe(false);
  });
  it("requires numeric metrics and the containers collection", () => {
    const metric = {
      resourceId: "server-1",
      cpu: 10,
      memory: 20,
      disk: 30,
      online: true,
      at: "2026-10-19T00:00:00Z",
      containers: [],
    };
    expect(metricResponseSchema.parse(metric)).toEqual(metric);
    expect(
      metricResponseSchema.safeParse({ ...metric, cpu: "10" }).success,
    ).toBe(false);
    expect(
      metricResponseSchema.safeParse({ ...metric, containers: null }).success,
    ).toBe(false);
  });
});
