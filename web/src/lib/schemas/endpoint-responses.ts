import * as z from "zod/mini";

import { branchOptionResponseSchema } from "@/lib/schemas/branch-option";
import { deploymentResponseSchema } from "@/lib/schemas/deployments";
import { repositoryOptionResponseSchema } from "@/lib/schemas/repository-option";
import { resourceResponseSchema } from "@/lib/schemas/resources";
import { serviceOptionResponseSchema } from "@/lib/schemas/service-option";
import { zoneOptionResponseSchema } from "@/lib/schemas/zone-option";

export const getProviderZonesResponseSchema = z.array(zoneOptionResponseSchema);

export const getServiceOptionsResponseSchema = z.array(
  serviceOptionResponseSchema,
);

export const getRepositoriesResponseSchema = z.array(
  repositoryOptionResponseSchema,
);

export const getBranchesResponseSchema = z.array(branchOptionResponseSchema);

export const getGrantsResponseSchema = z.array(z.string());

export const probeServerFingerprintResponseSchema = z.object({
  fingerprint: z.string(),
});

export const getResourcesResponseSchema = z.array(resourceResponseSchema);

export const getDeploymentsResponseSchema = z.array(deploymentResponseSchema);
