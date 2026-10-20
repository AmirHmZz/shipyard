import * as z from "zod/mini";

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
