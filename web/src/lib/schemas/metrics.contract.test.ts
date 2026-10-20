import type * as z from "zod/mini";

import { expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import type { metricResponseSchema } from "./metrics";

it("keeps validated responses assignable to the OpenAPI contract", () => {
  expectTypeOf<z.infer<typeof metricResponseSchema>>().toExtend<
    components["schemas"]["Metric"]
  >();
});
