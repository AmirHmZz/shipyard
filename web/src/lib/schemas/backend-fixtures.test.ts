import { expect, it } from "vitest";

import { contractFixtures } from "@/test/api-contract-fixtures";

import { deletionResponseSchema } from "./acknowledgements";
import { dockerNetworkResponseSchema } from "./docker-networks";

it.each(contractFixtures("DeletionResult"))("accepts Go $name", ({ body }) => {
  expect(deletionResponseSchema.safeParse(body).success).toBe(true);
});
it.each(contractFixtures("DockerNetwork"))("accepts Go $name", ({ body }) => {
  expect(dockerNetworkResponseSchema.safeParse(body).success).toBe(true);
});
