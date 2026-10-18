import { applicationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getComposeSource } from "../services";
import type { Resource } from "@/lib/api";

export function useComposeSource(app: Resource) {
  return useQuery({
    queryKey: applicationKeys.composeSource(app.id, app.version),
    queryFn: () => getComposeSource(app),
    enabled: app.canWrite,
  });
}
