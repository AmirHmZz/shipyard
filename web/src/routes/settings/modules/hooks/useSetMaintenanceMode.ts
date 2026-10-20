import type { MutationFunctionContext } from "@tanstack/react-query";

import type { Session } from "@/lib/api/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { sessionKeys } from "@/lib/query-keys";

import type { MaintenanceSnapshot } from "../generics";

import { maintenanceResponseSchema, settingsKeys } from "../generics";

export function maintenancePolicy() {
  return {
    mutationKey: settingsKeys.maintenance,
    onMutate: async (enabled: boolean, context: MutationFunctionContext) => {
      await context.client.cancelQueries({ queryKey: sessionKeys.all });
      const session = context.client.getQueryData<Session | null>(
        sessionKeys.all,
      );
      context.client.setQueryData<Session | null>(sessionKeys.all, (current) =>
        current ? { ...current, maintenance: enabled } : current,
      );
      return { session };
    },
    onError: (
      _error: unknown,
      enabled: boolean,
      snapshot: MaintenanceSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      const previous = snapshot?.session;
      if (!previous) return;
      context.client.setQueryData<Session | null>(
        sessionKeys.all,
        (current) => {
          if (
            !current ||
            current.user.id !== previous.user.id ||
            current.maintenance !== enabled
          )
            return current;
          return { ...current, maintenance: previous.maintenance };
        },
      );
    },
    onSettled: (
      _data: unknown,
      _error: unknown,
      _enabled: boolean,
      _snapshot: MaintenanceSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      if (
        context.client.isMutating({ mutationKey: settingsKeys.maintenance }) ===
        1
      )
        return context.client.invalidateQueries({ queryKey: sessionKeys.all });
    },
  };
}
export function useSetMaintenanceMode() {
  return useApiMutation({
    ...maintenancePolicy(),
    method: "POST",
    path: "/settings/maintenance",
    body: (enabled: boolean) => ({ enabled }),
    schema: maintenanceResponseSchema,
  });
}
