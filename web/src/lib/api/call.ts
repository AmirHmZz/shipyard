import type * as z from "zod/mini";

import { safeParse } from "zod/mini";

import type { Result } from "@/lib/result";

import { err, ok } from "@/lib/result";
import { blobResponseSchema } from "@/lib/schemas/responses";

import type { ApiError } from "./errors";

import { getCSRF } from "./csrf";
import { errorEnvelopeSchema } from "./envelope";

export type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};
export type CallApiOptions<S extends z.ZodMiniType> = RequestOptions & {
  path: string;
  schema: S;
};

async function request(path: string, options: RequestOptions) {
  return fetch("/api/v1" + path, {
    method: options.method ?? "GET",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": getCSRF() },
  });
}

async function httpError(response: Response, path: string): Promise<ApiError> {
  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  const envelope = safeParse(errorEnvelopeSchema, value);
  const message = envelope.success ? envelope.data.error : "";
  return {
    kind: "http",
    path,
    status: response.status,
    message: message || response.statusText || "Request failed",
  };
}

function requestError(
  cause: unknown,
  path: string,
  signal?: AbortSignal,
): ApiError {
  if (
    signal?.aborted ||
    (cause instanceof Error && cause.name === "AbortError")
  )
    return { kind: "aborted", path };
  return { kind: "network", path, cause };
}

export async function callApi<S extends z.ZodMiniType>({
  path,
  schema,
  ...options
}: CallApiOptions<S>): Promise<Result<z.output<S>, ApiError>> {
  try {
    const response = await request(path, options);
    if (!response.ok) return err(await httpError(response, path));
    const text = await response.text();
    let value: unknown;
    try {
      value = text ? JSON.parse(text) : undefined;
    } catch {
      return err({ kind: "parse", path });
    }
    const parsed = safeParse(schema, value);
    if (!parsed.success)
      return err({ kind: "schema", path, issues: parsed.error.issues });
    return ok(parsed.data);
  } catch (cause) {
    return err(requestError(cause, path, options.signal));
  }
}

export function callApiBlob(
  path: string,
  options?: RequestOptions,
): Promise<Result<Blob, ApiError>>;
export function callApiBlob<S extends z.ZodMiniType>(
  path: string,
  options: RequestOptions & { schema: S },
): Promise<Result<z.output<S>, ApiError>>;
export async function callApiBlob(
  path: string,
  options: RequestOptions & { schema?: z.ZodMiniType } = {},
): Promise<Result<unknown, ApiError>> {
  try {
    const response = await request(path, options);
    if (!response.ok) return err(await httpError(response, path));
    if (
      !response.headers
        .get("Content-Type")
        ?.includes("application/octet-stream")
    )
      return err({ kind: "parse", path });
    const parsed = safeParse(
      options.schema ?? blobResponseSchema,
      await response.blob(),
    );
    if (!parsed.success)
      return err({ kind: "schema", path, issues: parsed.error.issues });
    return ok(parsed.data);
  } catch (cause) {
    return err(requestError(cause, path, options.signal));
  }
}
