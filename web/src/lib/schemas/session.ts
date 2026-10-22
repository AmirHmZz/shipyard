import * as z from "zod/mini";

import { userResponseSchema } from "@/lib/schemas/user";

export const sessionResponseSchema = z.object({
  user: userResponseSchema,
  csrf: z.string(),
  maintenance: z.optional(z.union([z.literal(false), z.literal(true)])),
});
export const sessionOrSignedOutResponseSchema = z.nullable(
  sessionResponseSchema,
);
