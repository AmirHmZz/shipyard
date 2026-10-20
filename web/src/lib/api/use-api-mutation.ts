import type { QueryKey, UseMutationOptions } from "@tanstack/react-query";
import type * as z from "zod/mini";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { callApi, callApiBlob } from "./call";
import { ApiException } from "./errors";

export type ApiMutationOptions<
  S extends z.ZodMiniType,
  TVariables,
  TContext,
> = Omit<
  UseMutationOptions<z.output<S>, ApiException, TVariables, TContext>,
  "mutationFn"
> & {
  method: string;
  path: string | ((variables: TVariables) => string);
  body?: (variables: TVariables) => unknown;
  schema: S;
  responseType?: "json" | "blob";
  invalidate?: readonly QueryKey[];
};
export function useApiMutation<
  S extends z.ZodMiniType,
  TVariables = void,
  TContext = unknown,
>({
  method,
  path,
  body,
  schema,
  responseType = "json",
  invalidate = [],
  ...options
}: ApiMutationOptions<S, TVariables, TContext>) {
  const client = useQueryClient();
  return useMutation<z.output<S>, ApiException, TVariables, TContext>({
    ...options,
    mutationFn: async (variables) => {
      const requestPath = typeof path === "function" ? path(variables) : path;
      const requestBody = body?.(variables);
      const result =
        responseType === "blob"
          ? await callApiBlob(requestPath, {
              method,
              body: requestBody,
              schema,
            })
          : await callApi({
              method,
              path: requestPath,
              body: requestBody,
              schema,
            });
      if (!result.ok) throw new ApiException(result.error);
      return result.data;
    },
    onSettled:
      options.onSettled ??
      (() =>
        Promise.all(
          invalidate.map((queryKey) => client.invalidateQueries({ queryKey })),
        )),
  });
}
