import { expect, it } from "vitest";

import { contractFixtures } from "@/test/api-contract-fixtures";

import {
  applicationNetworkingResponseSchema,
  domainStatusResponseSchema,
  runtimeResponseSchema,
} from "./schema";

it.each(contractFixtures("DomainState"))("accepts Go $name", ({ body }) => {
  expect(domainStatusResponseSchema.safeParse(body).success).toBe(true);
});
it.each(contractFixtures("ApplicationNetworking"))(
  "accepts Go $name",
  ({ body }) => {
    expect(applicationNetworkingResponseSchema.safeParse(body).success).toBe(
      true,
    );
  },
);
it.each(contractFixtures("ApplicationRuntime"))(
  "accepts Go $name",
  ({ body }) => {
    expect(runtimeResponseSchema.safeParse(body).success).toBe(true);
  },
);
