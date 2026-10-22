import { expect, it } from "vitest";

import { contractFixtures } from "@/test/api-contract-fixtures";

import { errorEnvelopeSchema } from "./envelope";

it.each(contractFixtures("Error"))(
  "accepts the Go error envelope from $name",
  ({ body }) => {
    expect(errorEnvelopeSchema.safeParse(body).success).toBe(true);
  },
);
