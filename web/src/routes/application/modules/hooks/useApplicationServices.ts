import { applicationServiceKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { getApplicationServices } from "../services";
import type { Resource } from "@/lib/api";

export function useApplicationServices(app: Resource) {
  return useQuery({
    queryKey: applicationServiceKeys.version(app.id, app.version),
    queryFn: () => getApplicationServices(app),
    enabled: app.canWrite,
    retry: false,
  });
}
