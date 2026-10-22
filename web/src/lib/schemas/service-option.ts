import * as z from "zod/mini";

export const serviceOptionResponseSchema = z.object({
  name: z.string(),
  ignoredPorts: z.boolean(),
});
