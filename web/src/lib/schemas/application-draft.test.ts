import { expect, it } from "vitest";

import {
  readinessChecksDraftSchema,
  previewRoutingDraftSchema,
  httpReadinessChecksSchema,
  previewRoutingSchema,
} from "./application";

it("keeps incomplete editable rows while submission rejects invalid readiness and preview targets", () => {
  const readiness = [{ service: "", port: 0, path: "" }];
  expect(readinessChecksDraftSchema.safeParse(readiness)).toMatchObject({
    success: true,
    data: readiness,
  });
  expect(httpReadinessChecksSchema.safeParse(readiness).success).toBe(false);
  const preview = { mode: "target", service: "", port: 0 };
  expect(previewRoutingDraftSchema.safeParse(preview)).toMatchObject({
    success: true,
    data: preview,
  });
  expect(previewRoutingSchema.safeParse(preview).success).toBe(false);
});
