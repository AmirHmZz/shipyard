export {
  dockerNetworkResponseSchema,
  getDockerNetworksResponseSchema,
} from "@/lib/schemas/docker-networks";
import * as z from "zod/mini";

export const controlPlaneNetworkSchema = z.object({
  networkId: z.string(),
  desired: z.boolean(),
  attached: z.boolean(),
  error: z.string(),
});
export const controlPlaneNetworksSchema = z.object({
  available: z.boolean(),
  networks: z.array(controlPlaneNetworkSchema),
});
export const attachmentInputSchema = z.stringbool();
