import * as z from "zod/mini";

const jsonObjectSchema = z.record(z.string(), z.unknown());

export function jsonObject(value: unknown) {
  return z.parse(jsonObjectSchema, value);
}
