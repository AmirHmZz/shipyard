import type { MutationFunctionContext } from "@tanstack/react-query";

import type { DNSRecord } from "@/lib/api/types";

import { useApiMutation } from "@/lib/api/use-api-mutation";
import { apiPath } from "@/lib/paths";
import { okResponseSchema } from "@/lib/schemas/acknowledgements";

import type { RemovedDNSRecordSnapshot } from "../generics";

import { dnsKeys } from "../generics";

export function dnsRecordRemovalPolicy(zoneId: string) {
  const queryKey = dnsKeys.records(zoneId);
  return {
    mutationKey: dnsKeys.removal,
    onMutate: async (id: string, context: MutationFunctionContext) => {
      await context.client.cancelQueries({ queryKey });
      const records = context.client.getQueryData<DNSRecord[]>(queryKey);
      context.client.setQueryData<DNSRecord[]>(queryKey, (current) =>
        current?.filter((record) => record.id !== id),
      );
      return { queryKey, records };
    },
    onError: (
      _error: unknown,
      id: string,
      snapshot: RemovedDNSRecordSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      const previous = snapshot?.records;
      if (!snapshot || !previous) return;
      const removed = previous.find((record) => record.id === id);
      if (!removed) return;
      context.client.setQueryData<DNSRecord[]>(snapshot.queryKey, (current) => {
        if (!current) return previous;
        if (current.some((record) => record.id === id)) return current;
        const anchor = previous
          .slice(previous.indexOf(removed) + 1)
          .find((record) => current.some((row) => row.id === record.id));
        const position = current.findIndex(
          (record) => record.id === anchor?.id,
        );
        const restored = [...current];
        restored.splice(position < 0 ? restored.length : position, 0, removed);
        return restored;
      });
    },
    onSettled: (
      _data: unknown,
      _error: unknown,
      _id: string,
      _snapshot: RemovedDNSRecordSnapshot | undefined,
      context: MutationFunctionContext,
    ) => {
      if (context.client.isMutating({ mutationKey: dnsKeys.removal }) === 1)
        return context.client.invalidateQueries({
          queryKey: dnsKeys.recordsPrefix,
        });
    },
  };
}

export function useRemoveDNSRecord(zoneId: string) {
  return useApiMutation({
    ...dnsRecordRemovalPolicy(zoneId),
    method: "DELETE",
    path: (recordId: string) => apiPath`/zones/${zoneId}/records/${recordId}`,
    body: () => ({}),
    schema: okResponseSchema,
  });
}
