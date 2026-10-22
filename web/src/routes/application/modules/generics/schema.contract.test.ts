import type * as z from "zod/mini";

import { expect, expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import type {
  volumeMountResponseSchema,
  applicationVolumeResponseSchema,
  applicationVolumesResponseSchema,
  composeSourceResponseSchema,
} from "./schema";

import { previewApplicationRoutingSchema } from "./schema";

it("requires a routable preview target when inheritance has no HTTP routes", () => {
  const schema = previewApplicationRoutingSchema(false);
  expect(
    schema.safeParse({ enabled: true, routing: { mode: "inherit" } }).success,
  ).toBe(false);
  expect(
    schema.safeParse({ enabled: false, routing: { mode: "inherit" } }).success,
  ).toBe(true);
  expect(
    schema.safeParse({ enabled: true, routing: { mode: "private" } }).success,
  ).toBe(true);
  expect(
    schema.safeParse({
      enabled: true,
      routing: { mode: "target", service: "web", port: "8080" },
    }),
  ).toMatchObject({ success: true, data: { routing: { port: 8080 } } });
  expect(
    previewApplicationRoutingSchema(true).safeParse({
      enabled: true,
      routing: { mode: "inherit" },
    }).success,
  ).toBe(true);
});

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
