import * as z from "zod/mini";

export const zoneOptionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
});
