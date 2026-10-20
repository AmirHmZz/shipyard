import type * as z from "zod/mini";

import type { dockerVersionResultResponseSchema } from "./schema";
// TODO(openapi): add DockerVersionResult to api/openapi.yaml.
export type DockerVersionResult = z.infer<
  typeof dockerVersionResultResponseSchema
>;
