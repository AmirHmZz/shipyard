import { expect, it } from "vitest";

import { contractFixtures } from "@/test/api-contract-fixtures";

import { systemUpdatesResponseSchema } from "./schema";

it.each(contractFixtures("SystemUpdates"))("accepts Go $name", ({ body }) => {
  expect(systemUpdatesResponseSchema.safeParse(body).success).toBe(true);
});
