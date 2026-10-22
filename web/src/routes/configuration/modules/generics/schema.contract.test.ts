import type * as z from "zod/mini";

import { expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import type {
  giteaInstanceResponseSchema,
  gitSetupStartResponseSchema,
  gitSetupStatusResponseSchema,
  haProxyFrontendResponseSchema,
  haProxySettingsResponseSchema,
} from "./schema";

it("keeps validated responses assignable to the OpenAPI contract", () => {
  expectTypeOf<z.infer<typeof giteaInstanceResponseSchema>>().toExtend<
    components["schemas"]["GiteaInstance"]
  >();
  expectTypeOf<z.infer<typeof gitSetupStartResponseSchema>>().toExtend<
    components["schemas"]["GitSetupStart"]
  >();
  expectTypeOf<z.infer<typeof gitSetupStatusResponseSchema>>().toExtend<
    components["schemas"]["GitSetupStatus"]
  >();
  expectTypeOf<z.infer<typeof haProxyFrontendResponseSchema>>().toExtend<
    components["schemas"]["HAProxyFrontend"]
  >();
  expectTypeOf<z.infer<typeof haProxySettingsResponseSchema>>().toExtend<
    components["schemas"]["HAProxySettings"]
  >();
});
