import type * as z from "zod/mini";

import { expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import type {
  deletionItemResponseSchema,
  serverDeletionPlanResponseSchema,
  serverDeletionStatusResponseSchema,
} from "./schema";

it("keeps validated responses assignable to the OpenAPI contract", () => {
  expectTypeOf<z.infer<typeof deletionItemResponseSchema>>().toExtend<
    components["schemas"]["DeletionItem"]
  >();
  expectTypeOf<z.infer<typeof serverDeletionPlanResponseSchema>>().toExtend<
    components["schemas"]["ServerDeletionPlan"]
  >();
  expectTypeOf<z.infer<typeof serverDeletionStatusResponseSchema>>().toExtend<
    components["schemas"]["ServerDeletionStatus"]
  >();
});
