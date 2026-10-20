import type * as z from "zod/mini";

import type { DraftRow } from "@/lib/draft-rows";

import type {
  runtimeResponseSchema,
  attachmentResponseSchema,
  composeSourceResponseSchema,
  applicationNetworkingResponseSchema,
  applicationReleasesResponseSchema,
  applicationServicesResponseSchema,
  domainStatusResponseSchema,
  deploymentCreationResultResponseSchema,
  applicationVolumesResponseSchema,
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

// TODO(openapi): add ApplicationNetworkingResponse to api/openapi.yaml.
export type ApplicationNetworkingResponse = z.infer<
  typeof applicationNetworkingResponseSchema
>;

// TODO(openapi): add ApplicationReleasesResponse to api/openapi.yaml.
export type ApplicationReleasesResponse = z.infer<
  typeof applicationReleasesResponseSchema
>;

// TODO(openapi): add ApplicationServicesResponse to api/openapi.yaml.
export type ApplicationServicesResponse = z.infer<
  typeof applicationServicesResponseSchema
>;

// TODO(openapi): add DomainStatusResponse to api/openapi.yaml.
export type DomainStatusResponse = z.infer<typeof domainStatusResponseSchema>;

// TODO(openapi): add DeploymentCreationResult to api/openapi.yaml.
export type DeploymentCreationResult = z.infer<
  typeof deploymentCreationResultResponseSchema
>;

export type ApplicationVolumesResponse = z.infer<
  typeof applicationVolumesResponseSchema
>;
