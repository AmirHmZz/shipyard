import type * as z from "zod/mini";

import type { setupStatusResponseSchema, authFormSchema } from "./schema";
export type AuthValues = z.output<ReturnType<typeof authFormSchema>>;
// TODO(openapi): add SetupStatusResponse to api/openapi.yaml.
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;
