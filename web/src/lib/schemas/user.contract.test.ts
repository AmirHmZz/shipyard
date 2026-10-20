import type * as z from "zod/mini";

import { expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import type { userResponseSchema } from "./user";

it("keeps validated responses assignable to the OpenAPI contract", () => {
  expectTypeOf<z.infer<typeof userResponseSchema>>().toExtend<
    components["schemas"]["User"]
  >();
});
