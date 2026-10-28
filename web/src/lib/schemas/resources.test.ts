import { describe, expect, it } from "vitest";

import { resourceDeletionSchema } from "./resources";

describe("resource deletion confirmation", () => {
  it.each(["Backend 2", " Backend 2 ", "Backend\u00a02", "Backend   2"])(
    "accepts the renamed name %s",
    (name) => {
      expect(
        resourceDeletionSchema("Backend 2").safeParse({ name }).success,
      ).toBe(true);
    },
  );
  it("normalizes Unicode without ignoring case or a different name", () => {
    expect(
      resourceDeletionSchema("Café").safeParse({ name: "Cafe\u0301" }).success,
    ).toBe(true);
    for (const name of ["Backend", "backend 2", "Backend 3", ""]) {
      expect(
        resourceDeletionSchema("Backend 2").safeParse({ name }).success,
      ).toBe(false);
    }
  });
});
