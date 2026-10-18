import type { components } from "@/lib/schema";

export type AlertPolicy = components["schemas"]["AlertPolicy"];

export type Status = components["schemas"]["SystemUpdates"];

export type Plan = components["schemas"]["VersionChangePlan"];

export type State = components["schemas"]["DashboardAccess"];

// TODO(openapi): add user administration responses to api/openapi.yaml.
export type User = {
  id: string;
  name: string;
  email: string;
  admin: boolean;
  disabled: boolean;
  totp: boolean;
};

// TODO(openapi): add HistoryResponse to api/openapi.yaml.
export type HistoryResponse = Record<string, string | number>[];

// TODO(openapi): add TOTPRecoveryResult to api/openapi.yaml.
export type TOTPRecoveryResult = { recoveryCodes: string[] };
