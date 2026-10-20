import * as z from "zod/mini";

export const inputNumberSchema = z.coerce.number();
export const portSchema = z.coerce
  .number()
  .check(z.int(), z.gte(1), z.lte(65535));

// Legacy stored application ports can be absent or invalid. Keep their existing
// comparison behavior while interpreting numeric strings through the schema.
export function legacyPort(value: unknown) {
  const result = z.safeParse(inputNumberSchema, value);
  return result.success ? result.data : NaN;
}
