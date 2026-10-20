import * as z from "zod/mini";
export const errorEnvelopeSchema = z.object({ error: z.string() });
