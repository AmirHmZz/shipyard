import type * as z from "zod/mini";

import type { setupStatusResponseSchema } from "./schema";
// TODO(openapi): add SetupStatusResponse to api/openapi.yaml.
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;
