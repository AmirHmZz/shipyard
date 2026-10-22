import { describe, expect, it } from "vitest";

import { domainStatusResponseSchema } from "./schema";

describe("route status wire responses", () => {
  const state = {
    routeId: "route-1",
    domain: "app.example.com",
    dns: "ready",
    propagation: "ready",
    certificate: "ready",
    routing: "ready",
    error: "",
    expiresAt: "2027-01-20T00:00:00Z",
    records: [
      {
        id: "record",
        type: "A",
        name: "app.example.com",
        content: "192.0.2.1",
        owned: true,
      },
    ],
  };

  it("accepts persisted ready states and their owned records", () => {
    expect(domainStatusResponseSchema.parse(state)).toEqual(state);
  });

  it("accepts pending certificates and exposes DNS conflicts", () => {
    const conflict = {
      ...state,
      dns: "conflict",
      expiresAt: null,
      records: [],
      error: "DNS record conflict",
    };
    expect(domainStatusResponseSchema.parse(conflict)).toEqual(conflict);
  });

  it("rejects invalid collection and state types", () => {
    expect(
      domainStatusResponseSchema.safeParse({ ...state, records: "ready" })
        .success,
    ).toBe(false);
    expect(
      domainStatusResponseSchema.safeParse({ ...state, routing: false })
        .success,
    ).toBe(false);
  });
});
