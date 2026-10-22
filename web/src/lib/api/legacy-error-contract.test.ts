import { expect, it } from "vitest";
import * as z from "zod/mini";

import { describeError } from "./translate-error";
it("preserves actionable errors, joins Zod issues, and handles non-errors", () => {
  expect(describeError(new Error("offline"))).toBe("offline");
  expect(describeError("failure")).toBe("Operation failed");
  const result = z
    .object({
      name: z.string({ error: "Name required" }),
      port: z.number({ error: "Port required" }),
    })
    .safeParse({});
  if (result.success) throw new Error("Expected invalid fixture");
  expect(describeError(result.error)).toBe("Name required Port required");
});
