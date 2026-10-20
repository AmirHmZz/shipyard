import type { QueryKey } from "@tanstack/react-query";
import type * as z from "zod/mini";

import type { Resource } from "@/lib/api/types";

import type { dockerNetworkResponseSchema } from "./schema";

export type DockerNetwork = z.infer<typeof dockerNetworkResponseSchema>;
export type RemovedNetworkSnapshot = {
  resources: Resource[] | undefined;
  removed: Resource | undefined;
  inventories: [QueryKey, DockerNetwork[] | undefined][];
};
