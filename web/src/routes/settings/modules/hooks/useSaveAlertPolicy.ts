import { useMutation, useQueryClient } from "@tanstack/react-query";

import { settingsKeys } from "../generics";
import { saveAlertPolicy } from "../services";

export function useSaveAlertPolicy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveAlertPolicy,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: settingsKeys.alertPolicy }),
  });
}
