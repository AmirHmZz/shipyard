import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { applicationKeys } from "../generics";
import { getComposeSource } from "../services";

export function useComposeSource(app: Resource) {
  return useQuery({
    queryKey: applicationKeys.composeSource(app.id, app.version),
    queryFn: () => getComposeSource(app),
    enabled: app.canWrite,
  });
}
