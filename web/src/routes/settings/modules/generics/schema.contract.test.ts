import type * as z from "zod/mini";

import { expectTypeOf, it } from "vitest";

import type { components } from "@/lib/schema";

import type {
  alertPolicyResponseSchema,
  buildInfoResponseSchema,
  dashboardAccessResponseSchema,
  migrationDirectionResponseSchema,
  migrationResponseSchema,
  migrationStepResponseSchema,
  migrationPlanResponseSchema,
  releaseManifestResponseSchema,
  versionChangePlanResponseSchema,
  versionChangeOperationResponseSchema,
  systemUpdatesResponseSchema,
} from "./schema";

it("keeps validated responses assignable to the OpenAPI contract", () => {
  expectTypeOf<z.infer<typeof alertPolicyResponseSchema>>().toExtend<
    components["schemas"]["AlertPolicy"]
  >();
  expectTypeOf<z.infer<typeof buildInfoResponseSchema>>().toExtend<
    components["schemas"]["BuildInfo"]
  >();
  expectTypeOf<z.infer<typeof dashboardAccessResponseSchema>>().toExtend<
    components["schemas"]["DashboardAccess"]
  >();
  expectTypeOf<z.infer<typeof migrationDirectionResponseSchema>>().toExtend<
    components["schemas"]["MigrationDirection"]
  >();
  expectTypeOf<z.infer<typeof migrationResponseSchema>>().toExtend<
    components["schemas"]["Migration"]
  >();
  expectTypeOf<z.infer<typeof migrationStepResponseSchema>>().toExtend<
    components["schemas"]["MigrationStep"]
  >();
  expectTypeOf<z.infer<typeof migrationPlanResponseSchema>>().toExtend<
    components["schemas"]["MigrationPlan"]
  >();
  expectTypeOf<z.infer<typeof releaseManifestResponseSchema>>().toExtend<
    components["schemas"]["ReleaseManifest"]
  >();
  expectTypeOf<z.infer<typeof versionChangePlanResponseSchema>>().toExtend<
    components["schemas"]["VersionChangePlan"]
  >();
  expectTypeOf<z.infer<typeof versionChangeOperationResponseSchema>>().toExtend<
    components["schemas"]["VersionChangeOperation"]
  >();
  expectTypeOf<z.infer<typeof systemUpdatesResponseSchema>>().toExtend<
    components["schemas"]["SystemUpdates"]
  >();
});
