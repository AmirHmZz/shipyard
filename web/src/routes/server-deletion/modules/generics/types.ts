import type * as z from "zod/mini";

import type {
  serverDeletionPlanResponseSchema,
  serverDeletionStatusResponseSchema,
  deletionItemResponseSchema,
} from "./schema";

export type Plan = z.infer<typeof serverDeletionPlanResponseSchema>;

export type Status = z.infer<typeof serverDeletionStatusResponseSchema>;

export type Item = z.infer<typeof deletionItemResponseSchema>;
