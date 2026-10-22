import * as z from "zod/mini";

export function requiredText(label: string) {
  return z
    .string()
    .check(z.trim())
    .check(z.minLength(1, `${label} is required.`));
}

export const jsonText = z.pipe(
  z.string(),
  z.transform((value, context) => {
    try {
      return z.json().parse(JSON.parse(value || "{}"));
    } catch {
      context.issues.push({
        code: "custom",
        message: "Enter valid JSON.",
        input: context.value,
      });
      return z.NEVER;
    }
  }),
);

export const csvText = z.pipe(
  z.string(),
  z.transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  ),
);
