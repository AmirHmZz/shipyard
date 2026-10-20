import type * as z from "zod/mini";

import type { DraftRow } from "@/lib/draft-rows";

import type {
  giteaInstanceResponseSchema,
  gitSetupStatusResponseSchema,
  gitSetupStartResponseSchema,
  haProxySettingsResponseSchema,
  gitSetupConfigResponseSchema,
  haProxyUpdateResultResponseSchema,
  dockerNetworkInventoryResponseSchema,
  gitWebhookSecretResultResponseSchema,
} from "./schema";

export type InstanceDraft = {
  id: string;
  name: string;
  url: string;
  clientId: string;
  clientSecret: string;
};

export type Instance = z.infer<typeof giteaInstanceResponseSchema>;

export type Status = z.infer<typeof gitSetupStatusResponseSchema>;

export type Start = z.infer<typeof gitSetupStartResponseSchema>;

export type Settings = z.infer<typeof haProxySettingsResponseSchema>;

export type Draft = {
  version: number;
  bindings: Record<string, DraftRow<{ value: string }>[]>;
};

// TODO(openapi): add GitSetupConfigResponse to api/openapi.yaml.
export type GitSetupConfigResponse = z.infer<
  typeof gitSetupConfigResponseSchema
>;

// TODO(openapi): add HAProxyUpdateResult to api/openapi.yaml.
export type HAProxyUpdateResult = z.infer<
  typeof haProxyUpdateResultResponseSchema
>;

// TODO(openapi): add the Docker network inventory response to api/openapi.yaml.
export type DockerNetworkInventory = z.infer<
  typeof dockerNetworkInventoryResponseSchema
>;

// TODO(openapi): add GitWebhookSecretResult to api/openapi.yaml.
export type GitWebhookSecretResult = z.infer<
  typeof gitWebhookSecretResultResponseSchema
>;
