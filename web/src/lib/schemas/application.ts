import * as z from "zod/mini";

// Editable rows retain incomplete text and zero ports until submission validates them.
export const readinessChecksDraftSchema = z.array(
  z.object({ service: z.string(), port: z.number(), path: z.string() }),
);
export const previewRoutingDraftSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("inherit") }),
  z.object({ mode: z.literal("private") }),
  z.object({
    mode: z.literal("target"),
    service: z.string(),
    port: z.number(),
  }),
]);

export const httpReadinessChecksSchema = z
  .array(
    z.object({
      service: z
        .string()
        .check(z.trim())
        .check(z.minLength(1, "Enter a readiness service.")),
      port: z.coerce
        .number()
        .check(z.int())
        .check(z.gte(1))
        .check(z.lte(65535)),
      path: z
        .string()
        .check(z.startsWith("/"))
        .check(z.refine((v) => !/[\r\n]/.test(v), "Invalid readiness path.")),
    }),
  )
  .check(
    z.check((context) => {
      const checks = context.value;
      const seen = new Set<string>();
      for (const check of checks) {
        const key = JSON.stringify(check);
        if (seen.has(key))
          context.issues.push({
            code: "custom",
            message: "Duplicate HTTP readiness check.",
            input: context.value,
          });
        seen.add(key);
      }
    }),
  );

export const previewRoutingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("inherit") }),
  z.object({ mode: z.literal("private") }),
  z.object({
    mode: z.literal("target"),
    service: z
      .string()
      .check(z.trim())
      .check(z.minLength(1, "Enter a preview service.")),
    port: z.coerce.number().check(z.int()).check(z.gte(1)).check(z.lte(65535)),
  }),
]);

export function previewApplicationRoutingSchema(hasRoutes: boolean) {
  return z
    .object({ enabled: z.boolean(), routing: previewRoutingSchema })
    .check(
      z.check((context) => {
        if (
          context.value.enabled &&
          context.value.routing.mode === "inherit" &&
          !hasRoutes
        )
          context.issues.push({
            code: "custom",
            message:
              "Configure an explicit preview target or private previews when there are no HTTP/gRPC routes.",
            input: context.value,
          });
      }),
    );
}
