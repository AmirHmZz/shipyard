import * as z from "zod/mini";

import { API_ERROR_MESSAGES } from "@/lib/constants";

import type { ApiError } from "./errors";

import { ApiException } from "./errors";

export function translateApiError(error: ApiError): string {
  if (error.kind === "aborted") return "";
  if (error.kind === "network") return API_ERROR_MESSAGES.network;
  if (error.kind === "parse" || error.kind === "schema")
    return API_ERROR_MESSAGES.unexpected;
  if (error.status === 401) return API_ERROR_MESSAGES.unauthorized;
  if (error.status === 403) return API_ERROR_MESSAGES.forbidden;
  if (error.status >= 500) return error.message || API_ERROR_MESSAGES.server;
  return error.message || API_ERROR_MESSAGES.failed;
}
export function translateIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((issue) => issue.message).join(" ");
}
export function describeError(error: unknown): string {
  if (error instanceof ApiException) return translateApiError(error.error);
  if (error instanceof z.core.$ZodError) return translateIssues(error.issues);
  return error instanceof Error ? error.message : API_ERROR_MESSAGES.failed;
}
