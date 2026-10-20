import * as z from "zod/mini";

import type { ResourceKind } from "@/lib/resource-form-definitions";

import { RESOURCE_KINDS } from "@/lib/enums";
import { fields, parents } from "@/lib/resource-form-definitions";
import {
  httpReadinessChecksSchema,
  previewRoutingSchema,
} from "@/lib/schemas/application";
import { jsonText, csvText, requiredText } from "@/lib/schemas/form-rules";

export type ResourceFormInput = {
  kind: ResourceKind;
  name: string;
  parentId: string;
  teamId: string;
  data: Record<string, unknown>;
  secrets: Record<string, string>;
  version: number;
};

export function resourceFormSchema(kind: ResourceKind) {
  const shape: Record<string, z.ZodMiniType> = {};
  for (const field of fields[kind]) {
    if (field.type === "readiness")
      shape[field.key] = z.optional(httpReadinessChecksSchema);
    else if (field.type === "previewRouting")
      shape[field.key] = z.optional(previewRoutingSchema);
    else if (field.type === "json")
      shape[field.key] = z.optional(
        z.union([
          jsonText,
          z.json().check(z.refine((value) => typeof value !== "string")),
        ]),
      );
    else if (field.type === "csv")
      shape[field.key] = z.optional(z.union([csvText, z.array(z.string())]));
    else if (field.type === "number")
      shape[field.key] = z.optional(z.coerce.number());
    else if (field.type === "switch")
      shape[field.key] = z.optional(z.boolean());
    else if (field.options)
      shape[field.key] = z.optional(z.enum(field.options));
    else shape[field.key] = z.optional(z.string());
  }
  const data = z.catchall(z.object(shape), z.unknown());
  return z
    .object({
      kind: z.enum(RESOURCE_KINDS),
      name: kind === "route" ? z.string() : requiredText("Name"),
      parentId: parents[kind] ? requiredText("Parent resource") : z.string(),
      teamId: z.string(),
      data,
      secrets: z.record(z.string(), z.string()),
      version: z.coerce.number().check(z.int()).check(z.gte(0)),
    })
    .check(
      z.check((context) => {
        const value = context.value;
        if (
          value.kind === "application" &&
          value.data.source !== "compose" &&
          !value.data.branch
        )
          context.issues.push({
            code: "custom",
            path: ["data", "branch"],
            message: "Select a repository branch.",
            input: context.value,
          });
      }),
    );
}

export function parseResourceForm(input: ResourceFormInput) {
  return resourceFormSchema(input.kind).parse(input);
}
