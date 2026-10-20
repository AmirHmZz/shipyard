import type { QueryKey, UseQueryOptions } from "@tanstack/react-query";
import type * as z from "zod/mini";

import { useQuery } from "@tanstack/react-query";

import { callApi } from "./call";
import { captureSession, captureSessionFailure } from "./csrf";
import { ApiException } from "./errors";

export type ApiQueryOptions<
  S extends z.ZodMiniType,
  TData = z.output<S>,
> = Omit<
  UseQueryOptions<z.output<S>, ApiException, TData>,
  "queryKey" | "queryFn"
> & { queryKey: QueryKey; path: string; schema: S };
export function useApiQuery<S extends z.ZodMiniType, TData = z.output<S>>({
  path,
  schema,
  queryKey,
  ...options
}: ApiQueryOptions<S, TData>) {
  return useQuery<z.output<S>, ApiException, TData>({
    ...options,
    queryKey,
    queryFn: async ({ signal }) => {
      const result = await callApi({ path, schema, signal });
      if (!result.ok) {
        if (captureSessionFailure(path, result.error)) {
          const signedOut = schema.safeParse(null);
          if (signedOut.success) return signedOut.data;
        }
        throw new ApiException(result.error);
      }
      captureSession(path, result.data);
      return result.data;
    },
  });
}
