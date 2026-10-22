import type * as z from "zod/mini";

import type {
  serverDeletionPlanResponseSchema,
  serverDeletionStatusResponseSchema,
  deletionItemResponseSchema,
  serverDeletionSchema,
} from "./schema";

export type Plan = z.infer<typeof serverDeletionPlanResponseSchema>;

export type Status = z.infer<typeof serverDeletionStatusResponseSchema>;

export type Item = z.infer<typeof deletionItemResponseSchema>;
export type ServerDeletionConfirmation = z.infer<
  ReturnType<typeof serverDeletionSchema>
>;
export type ConnectionRepairPayload = {
  host: string;
  port: number;
  user: string;
  fingerprint: string;
  authMethod: string;
  secrets: Record<string, string>;
};
