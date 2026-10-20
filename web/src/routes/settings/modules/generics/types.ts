import type * as z from "zod/mini";

import type {
  alertPolicyResponseSchema,
  systemUpdatesResponseSchema,
  versionChangePlanResponseSchema,
  dashboardAccessResponseSchema,
  userResponseSchema,
  historyResponseSchema,
  totpRecoveryResultResponseSchema,
} from "./schema";

export type AlertPolicy = z.infer<typeof alertPolicyResponseSchema>;

export type Status = z.infer<typeof systemUpdatesResponseSchema>;

export type Plan = z.infer<typeof versionChangePlanResponseSchema>;

export type State = z.infer<typeof dashboardAccessResponseSchema>;

// TODO(openapi): add user administration responses to api/openapi.yaml.
export type User = z.infer<typeof userResponseSchema>;

// TODO(openapi): add HistoryResponse to api/openapi.yaml.
export type HistoryResponse = z.infer<typeof historyResponseSchema>;

// TODO(openapi): add TOTPRecoveryResult to api/openapi.yaml.
export type TOTPRecoveryResult = z.infer<
  typeof totpRecoveryResultResponseSchema
>;
