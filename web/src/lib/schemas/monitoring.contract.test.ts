import type * as z from "zod/mini";

import { expect, expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import { contractFixtures } from "@/test/api-contract-fixtures";

import type {
  monitoringDefaultsSchema,
  monitoringPolicyStateSchema,
  monitoringResourcesSchema,
} from "./monitoring";

import { metricResponseSchema } from "./metrics";
import { monitoringPolicySchema, monitoringRangeSchema } from "./monitoring";

it("keeps monitoring response schemas aligned with OpenAPI", () => {
  expectTypeOf<z.infer<typeof monitoringPolicySchema>>().toExtend<
    components["schemas"]["MonitoringPolicy"]
  >();
  expectTypeOf<z.infer<typeof monitoringDefaultsSchema>>().toExtend<
    components["schemas"]["MonitoringDefaults"]
  >();
  expectTypeOf<z.infer<typeof monitoringPolicyStateSchema>>().toExtend<
    components["schemas"]["MonitoringPolicyState"]
  >();
  expectTypeOf<z.infer<typeof monitoringResourcesSchema>[number]>().toExtend<
    components["schemas"]["MonitoringResource"]
  >();
});
it.each(contractFixtures("Metric"))("accepts Go $name", ({ body }) => {
  expect(metricResponseSchema.safeParse(body).success).toBe(true);
});
it.each(contractFixtures("MonitoringPolicy"))(
  "accepts Go $name",
  ({ body }) => {
    expect(monitoringPolicySchema.safeParse(body).success).toBe(true);
  },
);
it("rejects unbounded history requests and invalid thresholds", () => {
  expect(monitoringRangeSchema.safeParse("365d").success).toBe(false);
  expect(
    monitoringPolicySchema.safeParse({
      enabled: true,
      cpu: 200,
      memory: 101,
      disk: 90,
      sustainedSeconds: 300,
      offlineSeconds: 60,
      destinations: [],
    }).success,
  ).toBe(false);
});
