import * as z from "zod/mini";

export const dockerNetworkResponseSchema = z.object({
  Id: z.string(),
  Name: z.string(),
  Driver: z.string(),
  EnableIPv6: z.boolean(),
  Labels: z.pipe(
    z.nullable(z.record(z.string(), z.string())),
    z.transform((value) => value ?? {}),
  ),
  IPAM: z.record(z.string(), z.unknown()),
  Containers: z.pipe(
    z.nullable(z.record(z.string(), z.unknown())),
    z.transform((value) => value ?? {}),
  ),
});

export const getDockerNetworksResponseSchema = z.array(
  dockerNetworkResponseSchema,
);
