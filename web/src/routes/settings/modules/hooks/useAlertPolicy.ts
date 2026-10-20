import { useQuery } from "@tanstack/react-query";

import { settingsKeys } from "../generics";
import { getAlertPolicy } from "../services";

export function useAlertPolicy() {
  return useQuery({
    queryKey: settingsKeys.alertPolicy,
    queryFn: () => getAlertPolicy(),
  });
}
