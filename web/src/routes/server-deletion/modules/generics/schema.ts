import * as z from "zod/mini";

import { SSH_AUTH_METHODS } from "@/lib/enums";
import { requiredText } from "@/lib/schemas/form-rules";

export const serverConnectionSchema = z.object({
  host: requiredText("SSH host"),
  port: z.coerce
    .number<number>()
    .check(z.int())
    .check(z.gte(1))
    .check(z.lte(65535)),
  user: requiredText("SSH user"),
  fingerprint: requiredText("Verified host fingerprint"),
  authMethod: z.enum(SSH_AUTH_METHODS),
  credential: z.string(),
});

export function serverDeletionSchema(serverName: string) {
  return z.object({
    planId: requiredText("Deletion plan"),
    name: z.literal(serverName, { error: "Type the server name to confirm." }),
    deleteVolumes: z.literal(true, { error: "Confirm volume deletion." }),
  });
}

export const deletionItemResponseSchema = z.object({
  kind: z.string(),
  id: z.string(),
  name: z.string(),
  reason: z.string(),
});

export const serverDeletionPlanResponseSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  serverName: z.string(),
  daemonId: z.string(),
  expiresAt: z.string(),
  remove: z.array(deletionItemResponseSchema),
  preserve: z.array(deletionItemResponseSchema),
  blockers: z.array(z.string()),
});

export const serverDeletionStatusResponseSchema = z.object({
  plan: serverDeletionPlanResponseSchema,
  stage: z.string(),
  error: z.string(),
  jobId: z.string(),
  done: z.boolean(),
});
