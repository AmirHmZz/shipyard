import { applicationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getApplicationNetworking } from "../services";
import type { Resource } from "@/lib/api";

export function useApplicationNetworking(app: Resource) {
  return useQuery({
    queryKey: applicationKeys.networking(app.id, app.version),
    queryFn: () => getApplicationNetworking(app),
  });
}
