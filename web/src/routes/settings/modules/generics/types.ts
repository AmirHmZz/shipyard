import type * as z from "zod/mini";

import type { Session } from "@/lib/api/types";

import type {
  alertPolicyResponseSchema,
  systemUpdatesResponseSchema,
  versionChangePlanResponseSchema,
  dashboardAccessResponseSchema,
  userResponseSchema,
  historyResponseSchema,
  totpRecoveryResultResponseSchema,
  passwordFormSchema,
  passphraseSchema,
  totpCodeSchema,
  totpPasswordSchema,
  totpDisableSchema,
  alertPolicySchema,
  updateFormSchema,
} from "./schema";

export type AlertPolicy = z.infer<typeof alertPolicyResponseSchema>;
export type MaintenanceSnapshot = { session: Session | null | undefined };

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
export type PasswordValues = z.infer<typeof passwordFormSchema>;
export type PassphraseValues = z.infer<typeof passphraseSchema>;
export type TOTPCodeValues = z.infer<typeof totpCodeSchema>;
export type TOTPPasswordValues = z.infer<typeof totpPasswordSchema>;
export type TOTPDisableValues = z.infer<typeof totpDisableSchema>;
export type AlertPolicyValues = z.infer<typeof alertPolicySchema>;
export type UpdateValues = z.infer<ReturnType<typeof updateFormSchema>>;
export type UserAccessVariables = {
  id: string | undefined;
  access: { admin: boolean | undefined; disabled: boolean | undefined };
};
export type DashboardAccessValues = {
  retry: boolean;
  payload: {
    version: number;
    domain?: string;
    acmeEmail?: string;
    acceptTos?: boolean;
  };
};
