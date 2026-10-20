import * as z from "zod/mini";

export const branchOptionResponseSchema = z.object({ name: z.string() });
