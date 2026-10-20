import { describe, expect, it } from "vitest";

import { serverDeletionSchema } from "./schema";
describe("dashboard form validation", () => {
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
