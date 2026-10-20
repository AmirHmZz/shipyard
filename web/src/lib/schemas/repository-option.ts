import * as z from "zod/mini";

export const repositoryOptionResponseSchema = z.object({
  full_name: z.string(),
});
