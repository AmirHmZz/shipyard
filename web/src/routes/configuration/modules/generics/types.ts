import { type DraftRow } from "@/lib/draft-rows";
import type { components } from "@/lib/schema";

export type InstanceDraft = {
  id: string;
  name: string;
  url: string;
  clientId: string;
  clientSecret: string;
};

export type Instance = components["schemas"]["GiteaInstance"];

export type Status = components["schemas"]["GitSetupStatus"];

export type Start = components["schemas"]["GitSetupStart"];

export type Settings = components["schemas"]["HAProxySettings"];

export type Draft = {
  version: number;
  bindings: Record<string, DraftRow<{ value: string }>[]>;
};

// TODO(openapi): add GitSetupConfigResponse to api/openapi.yaml.
export type GitSetupConfigResponse = { origin: string; giteaCallback: string };

// TODO(openapi): add HAProxyUpdateResult to api/openapi.yaml.
export type HAProxyUpdateResult = { jobId: string };

// TODO(openapi): add the Docker network inventory response to api/openapi.yaml.
export type DockerNetworkInventory = {
  Id: string;
  Name: string;
  Driver: string;
  Labels: Record<string, string>;
}[];

// TODO(openapi): add GitWebhookSecretResult to api/openapi.yaml.
export type GitWebhookSecretResult = { secret: string };
