/** Encode each identifier without changing the literal parts of an API path. */
export function apiPath(
  parts: TemplateStringsArray,
  ...values: (string | number | boolean | null | undefined)[]
): string {
  return parts.reduce(
    (path, part, index) =>
      path +
      (index > 0 ? encodeURIComponent(String(values[index - 1])) : "") +
      part,
    "",
  );
}
