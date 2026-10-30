import * as z from "zod/mini";

export function normalizeConfirmationName(name: string) {
  return name.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function resourceDeletionSchema(name: string) {
  return z.object({
    name: z
      .string()
      .check(
        z.refine(
          (value) =>
            normalizeConfirmationName(value) ===
            normalizeConfirmationName(name),
          "Type the resource name to confirm.",
        ),
      ),
  });
}

export const resourceResponseSchema = z.object({
  id: z.string(),
  logoUrl: z.optional(z.nullable(z.string())),
  sortOrder: z.optional(z.number()),
  kind: z.string(),
  name: z.string(),
  teamId: z.string(),
  parentId: z.string(),
  data: z.record(z.string(), z.unknown()),
  secretKeys: z.array(z.string()),
  variables: z.record(z.string(), z.string()),
  canWrite: z.boolean(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
