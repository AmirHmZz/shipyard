import type * as z from "zod/mini";

import { toast } from "sonner";

import { reportError } from "@/lib/telemetry";

import type { ApiError } from "./errors";

import { translateApiError, translateIssues } from "./translate-error";

export function reportApiError(error: ApiError) {
  if (error.kind !== "parse" && error.kind !== "schema") return;
  void reportError(new Error(JSON.stringify(error)));
}
export function toastApiError(error: ApiError) {
  const message = translateApiError(error);
  if (message)
    toast.error(message, { id: "api:" + error.path + ":" + message });
}
export function toastSuccess(message: string) {
  toast.success(message, { id: "api-success:" + message });
}
export function toastValidationError(error: z.core.$ZodError) {
  const message = translateIssues(error.issues);
  toast.error(message, { id: "validation:" + message });
}
