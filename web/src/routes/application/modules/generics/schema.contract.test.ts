import type * as z from "zod/mini";

import { expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import type {
  volumeMountResponseSchema,
  applicationVolumeResponseSchema,
  applicationVolumesResponseSchema,
  composeSourceResponseSchema,
} from "./schema";

it("keeps validated responses assignable to the OpenAPI contract", () => {
  expectTypeOf<z.infer<typeof volumeMountResponseSchema>>().toExtend<
    components["schemas"]["VolumeMount"]
  >();
  expectTypeOf<z.infer<typeof applicationVolumeResponseSchema>>().toExtend<
    components["schemas"]["ApplicationVolume"]
  >();
  expectTypeOf<z.infer<typeof applicationVolumesResponseSchema>>().toExtend<
    components["schemas"]["ApplicationVolumes"]
  >();
  expectTypeOf<z.infer<typeof composeSourceResponseSchema>>().toExtend<
    components["schemas"]["ComposeSource"]
  >();
});
