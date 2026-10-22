import type * as z from "zod/mini";

import { expect, expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import { dockerNetworkResponseSchema } from "./schema";

it("normalizes Docker's nil maps to empty maps without accepting invalid entries", () => {
  const network = {
    Id: "bridge",
    Name: "bridge",
    Driver: "bridge",
    EnableIPv6: false,
    Labels: null,
    IPAM: { Config: null },
    Containers: null,
  };
  expect(dockerNetworkResponseSchema.parse(network)).toEqual({
    ...network,
    Labels: {},
    Containers: {},
  });
  expect(
    dockerNetworkResponseSchema.safeParse({ ...network, Labels: { owner: 7 } })
      .success,
  ).toBe(false);
});

it("keeps validated responses assignable to the OpenAPI contract", () => {
  expectTypeOf<z.infer<typeof dockerNetworkResponseSchema>>().toExtend<
    components["schemas"]["DockerNetwork"]
  >();
});
