import { configurationKeys } from "../generics";
import { useQuery } from "@tanstack/react-query";
import { getGitSetupConfig } from "../services";

export function useGitSetupConfig() {
  return useQuery({
    queryKey: configurationKeys.gitSetupConfig,
    queryFn: () => getGitSetupConfig(),
  });
}
