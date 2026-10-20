import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiException } from "./errors";
import { reportApiError, toastApiError, toastSuccess } from "./toaster";

export interface ApiMeta extends Record<string, unknown> {
  silent?: boolean;
  toast?: boolean;
  successMessage?: string;
}
declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: ApiMeta;
    mutationMeta: ApiMeta;
  }
}

function handleError(error: unknown, notify: boolean) {
  // Legacy calls still own their notifications until their route is migrated.
  if (!(error instanceof ApiException)) return;
  reportApiError(error.error);
  if (notify) toastApiError(error.error);
}
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 5000, refetchOnWindowFocus: false },
    },
    queryCache: new QueryCache({
      onError: (error, query) =>
        handleError(error, !!query.meta?.toast && !query.meta?.silent),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) =>
        handleError(error, !mutation.meta?.silent),
      onSuccess: (_data, _variables, _result, mutation) => {
        if (mutation.meta?.successMessage)
          toastSuccess(mutation.meta.successMessage);
      },
    }),
  });
}
