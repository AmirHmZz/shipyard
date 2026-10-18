import { describe, expect, it } from "vitest";
import { relativeHostname, routeHostname } from "./route-hostname";

describe("relative route hostnames", () => {
  it.each(["", "api", "api.dev", "*.apps", "*"])("composes %s", (value) => {
    const full = routeHostname(value, "example.com");
    expect(full).toBe(value ? `${value}.example.com` : "example.com");
    expect(relativeHostname(full, "example.com")).toBe(value);
  });
  it.each([
    "example.com",
    "api.example.com",
    "*.example.com",
    "https://api",
    "a..b",
    "-api",
    "api-",
    "api/path",
    "api:443",
    "bad_underscore",
    "a.*",
  ])("rejects %s", (value) => {
    expect(() => routeHostname(value, "example.com")).toThrow();
  });
  it("requires a zone and enforces hostname length", () => {
    expect(() => routeHostname("api", "")).toThrow();
    expect(() => routeHostname("a".repeat(64), "example.com")).toThrow();
    expect(() =>
      routeHostname(Array(4).fill("a".repeat(63)).join("."), "example.com"),
    ).toThrow();
  });
});
