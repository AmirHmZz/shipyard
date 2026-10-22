import * as z from "zod/mini";

export function resourceDeletionSchema(name: string) {
  return z.object({
    name: z.literal(name, { error: "Type the resource name to confirm." }),
  });
}

export const resourceResponseSchema = z.object({
  id: z.string(),
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
