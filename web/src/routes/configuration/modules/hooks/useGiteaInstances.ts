import { configurationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getGiteaInstances } from "../services";

export function useGiteaInstances(provider: string) {
  return useQuery({
    queryKey: configurationKeys.giteaInstances,
    queryFn: () => getGiteaInstances(provider),
    enabled: provider === "gitea",
  });
}
