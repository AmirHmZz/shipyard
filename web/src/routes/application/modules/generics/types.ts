import type { components } from "@/lib/schema";
import { type DraftRow } from "@/lib/draft-rows";

export type Runtime = {
  status: string;
  releaseId?: string;
  commit?: string;
  containers?: string[];
  targets?: { port: number; address: string; networkId: string }[];
};

type Attachment = { networkId: string; ipv4?: string; ipv6?: string };

export type Service = {
  hostname?: string;
  connections: DraftRow<Attachment>[];
};

type NetworkService = { hostname?: string; connections: Attachment[] };

export type Port = {
  host: string;
  published: number;
  target: number;
  protocol: string;
};

export type Source = components["schemas"]["ComposeSource"];

// TODO(openapi): add ApplicationNetworkingResponse to api/openapi.yaml.
export type ApplicationNetworkingResponse = {
  version: number;
  services: Record<string, NetworkService>;
  pending: boolean;
  endpoints?: {
    service: string;
    replica: number;
    ipv4: string;
    ipv6: string;
    ingress: boolean;
    dockerName: string;
  }[];
};

// TODO(openapi): add ApplicationReleasesResponse to api/openapi.yaml.
export type ApplicationReleasesResponse = {
  id: string;
  commit: string;
  createdAt: string;
  images: Record<string, string>;
}[];

// TODO(openapi): add ApplicationServicesResponse to api/openapi.yaml.
export type ApplicationServicesResponse = {
  name: string;
  replicas: number;
  ignoredPorts: boolean;
}[];

// TODO(openapi): add DomainStatusResponse to api/openapi.yaml.
export type DomainStatusResponse = Record<string, string>;

// TODO(openapi): add DeploymentCreationResult to api/openapi.yaml.
export type DeploymentCreationResult = { id: string };
