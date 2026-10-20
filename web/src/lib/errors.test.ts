import { expect, it } from "vitest";
import * as z from "zod/mini";

import { errorMessage } from "./errors";
it("preserves actionable errors, joins Zod issues, and handles non-errors", () => {
  expect(errorMessage(new Error("offline"))).toBe("offline");
  expect(errorMessage("failure")).toBe("Operation failed");
  const result = z
    .object({
      name: z.string({ error: "Name required" }),
      port: z.number({ error: "Port required" }),
    })
    .safeParse({});
  if (result.success) throw new Error("Expected invalid fixture");
  expect(errorMessage(result.error)).toBe("Name required Port required");
});
