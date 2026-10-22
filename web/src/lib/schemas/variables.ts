import * as z from "zod/mini";

export const variableFormSchema = z.object({
  name: z
    .string()
    .check(
      z.regex(
        /^(env|build|preview-env|preview-build):[A-Za-z_][A-Za-z0-9_]*$/,
        "Enter a valid variable name.",
      ),
    ),
  value: z.string(),
  encrypted: z.boolean(),
});
export const variableRemovalSchema = z.object({
  name: z.string(),
  value: z.null(),
  encrypted: z.boolean(),
});
export const variableWriteSchema = z.union([
  variableFormSchema,
  variableRemovalSchema,
]);
