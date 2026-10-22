import { expect, it } from "vitest";

import {
  okResponseSchema,
  queuedResponseSchema,
  jobResponseSchema,
  deletionResponseSchema,
} from "./acknowledgements";

it("validates acknowledgements against their Go response bodies", () => {
  expect(okResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  expect(queuedResponseSchema.parse({ queued: true })).toEqual({
    queued: true,
  });
  expect(jobResponseSchema.parse({ jobId: "job-1" })).toEqual({
    jobId: "job-1",
  });
  expect(deletionResponseSchema.parse({ ok: true, jobId: "job-1" })).toEqual({
    ok: true,
    jobId: "job-1",
  });
  expect(deletionResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  for (const schema of [
    okResponseSchema,
    queuedResponseSchema,
    jobResponseSchema,
    deletionResponseSchema,
  ]) {
    expect(schema.safeParse({}).success).toBe(false);
    expect(
      schema.safeParse({ ok: "true", queued: "true", jobId: 1 }).success,
    ).toBe(false);
  }
});
