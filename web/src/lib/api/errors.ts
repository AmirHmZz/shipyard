import type * as z from "zod/mini";

export type ApiError =
  | { kind: "network"; path: string; cause: unknown }
  | { kind: "aborted"; path: string }
  | { kind: "http"; path: string; status: number; message: string }
  | { kind: "parse"; path: string }
  | { kind: "schema"; path: string; issues: z.core.$ZodIssue[] };

export class ApiException extends Error {
  constructor(public readonly error: ApiError) {
    super(error.kind === "http" ? error.message : error.kind);
    this.name = "ApiException";
  }
}
