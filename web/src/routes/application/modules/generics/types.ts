import type { QueryKey } from "@tanstack/react-query";
import type { useSearchParams } from "react-router";
import type * as z from "zod/mini";

import type { Resource } from "@/lib/api/types";
import type { Deployment } from "@/lib/api/types";
import type { DraftRow } from "@/lib/draft-rows";

import type {
  runtimeResponseSchema,
  attachmentResponseSchema,
  composeSourceResponseSchema,
} from "./schema";
import type {
  freshDeploySchema,
  composeSourceSchema,
  networkingPayloadSchema,
  publishedPortsPayloadSchema,
} from "./schema";

export type Runtime = z.infer<typeof runtimeResponseSchema>;

type Attachment = z.infer<typeof attachmentResponseSchema>;

export type Service = {
  hostname?: string;
  connections: DraftRow<Attachment>[];
};

export type Port = {
  host: string;
  published: number;
  target: number;
  protocol: string;
};

export type Source = z.infer<typeof composeSourceResponseSchema>;

export type FreshDeployValues = z.output<ReturnType<typeof freshDeploySchema>>;
export type ComposeSourceValues = z.output<typeof composeSourceSchema>;
export type PreviewSaveValues = {
  id: string;
  payload: Pick<Resource, "kind" | "name" | "version" | "data">;
};
export type NetworkingSaveValues = {
  published: boolean;
  payload:
    | z.output<typeof networkingPayloadSchema>
    | z.output<typeof publishedPortsPayloadSchema>;
};

export type RemovedDeploymentSnapshot = {
  lists: [QueryKey, Deployment[] | undefined][];
  selected: Deployment | undefined;
};

export type ApplicationDeploymentsOptions = {
  app: Resource;
  rows: Resource[];
  deployments: { data?: Deployment[] };
  releases: { data?: { id: string; commit: string; createdAt: string }[] };
  runtime: { data?: Runtime };
  params: URLSearchParams;
  setParams: ReturnType<typeof useSearchParams>[1];
  setConfirmAction: (action: string) => void;
  onDeleteDeployment: (deployment: Deployment) => void;
};

export type ApplicationDeployActionsOptions = {
  app: Resource;
  runtime?: { releaseId?: string; status: string };
  busy: boolean;
  deploy: (
    fresh?: boolean,
    confirmName?: string,
    onSuccess?: () => void,
  ) => void;
  deployError: string;
  resetDeploy: () => void;
  onAction: (action: string) => void;
  onDelete: () => void;
};

export type ApplicationActionConfirmationOptions = {
  confirmAction: string;
  setConfirmAction: (action: string) => void;
  id: string;
  setParams: ReturnType<typeof useSearchParams>[1];
};
