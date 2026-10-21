import type * as z from "zod/mini";

import type { authFormSchema } from "./schema";
export type AuthValues = z.output<ReturnType<typeof authFormSchema>>;
