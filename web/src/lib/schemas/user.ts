import * as z from "zod/mini";

export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  admin: z.boolean(),
  totp: z.boolean(),
});
