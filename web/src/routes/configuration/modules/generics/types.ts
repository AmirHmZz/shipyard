import type * as z from "zod/mini";

import type { DraftRow } from "@/lib/draft-rows";

import type {
  gitSetupStatusResponseSchema,
  gitSetupStartResponseSchema,
  haProxySettingsResponseSchema,
  giteaInstanceSchema,
  gitSetupSchema,
  haproxySettingsSchema,
} from "./schema";

export type InstanceDraft = {
  id: string;
  name: string;
  url: string;
  clientId: string;
  clientSecret: string;
};

export type Status = z.infer<typeof gitSetupStatusResponseSchema>;

export type Start = z.infer<typeof gitSetupStartResponseSchema>;

export type Settings = z.infer<typeof haProxySettingsResponseSchema>;

export type Draft = {
  version: number;
  bindings: Record<string, DraftRow<{ value: string }>[]>;
};

export type GiteaInstanceValues = z.infer<typeof giteaInstanceSchema>;
export type GitSetupValues = z.infer<typeof gitSetupSchema>;
export type HAProxyValues = z.infer<typeof haproxySettingsSchema>;
export type NewNetworkValues = {
  name: string;
  dockerId: string;
  subnet: string;
  dynamicRange: string;
  enableIPv6: boolean;
  ipv6Subnet: string;
};
