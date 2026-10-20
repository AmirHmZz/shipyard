import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { applicationServiceKeys } from "@/lib/query-keys";

import { getApplicationServices } from "../services";

export function useApplicationServices(app: Resource) {
  return useQuery({
    queryKey: applicationServiceKeys.version(app.id, app.version),
    queryFn: () => getApplicationServices(app),
    enabled: app.canWrite,
    retry: false,
  });
}
