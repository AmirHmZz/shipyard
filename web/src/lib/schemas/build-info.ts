import * as z from "zod/mini";

export const buildInfoResponseSchema = z.object({
  version: z.string(),
  commit: z.string(),
  builtAt: z.string(),
  architecture: z.string(),
  updaterProtocol: z.number(),
});
