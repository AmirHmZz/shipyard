import type * as z from "zod/mini";

import type { dockerNetworkResponseSchema } from "./schema";

export type DockerNetwork = z.infer<typeof dockerNetworkResponseSchema>;
