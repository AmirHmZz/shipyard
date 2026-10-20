import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/lib/api";

import { applicationKeys } from "../generics";
import { getApplicationNetworking } from "../services";

export function useApplicationNetworking(app: Resource) {
  return useQuery({
    queryKey: applicationKeys.networking(app.id, app.version),
    queryFn: () => getApplicationNetworking(app),
  });
}
