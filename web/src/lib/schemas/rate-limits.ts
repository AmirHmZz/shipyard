import * as z from "zod/mini";

export const maxRateLimits = 16;
export const maxRateLimitPathLength = 256;
export const maxRateLimitRequests = 1_000_000;
export const maxRateLimitWindow = 3600;
export const rateLimitMatchSchema = z.enum(["exact", "subtree"]);

const rateLimitDraftSchema = z.object({
  path: z.string(),
  match: rateLimitMatchSchema,
  requests: z.union([z.string(), z.number()]),
  windowSeconds: z.union([z.string(), z.number()]),
});

export const rateLimitDraftsSchema = z.array(
  z.extend(rateLimitDraftSchema, { id: z.number() }),
);

const rateLimitSchema = z
  .object({
    path: z.string().check(
      z.maxLength(maxRateLimitPathLength),
      z.regex(/^\/[A-Za-z0-9/._~-]*$/),
      z.refine(
        (path) =>
          !path.includes("//") &&
          !path.split("/").some((part) => part === "." || part === ".."),
        "Enter a literal path without repeated slashes or dot segments.",
      ),
    ),
    match: rateLimitMatchSchema,
    requests: z.coerce
      .number()
      .check(z.int(), z.gte(1), z.lte(maxRateLimitRequests)),
    windowSeconds: z.coerce
      .number()
      .check(z.int(), z.gte(1), z.lte(maxRateLimitWindow)),
  })
  .check(
    z.refine(
      ({ match, path }) =>
        match === "exact" || path === "/" || !path.endsWith("/"),
      "Remove the trailing slash from the subtree path.",
    ),
  );

export const rateLimitsSchema = z.array(rateLimitSchema).check(
  z.maxLength(maxRateLimits),
  z.refine(
    (rules) =>
      new Set(rules.map(({ match, path }) => match + path)).size ===
      rules.length,
    "Each path and match type can appear only once.",
  ),
);

export function rateLimitDrafts(value: unknown) {
  const parsed = z.array(rateLimitDraftSchema).safeParse(value);
  return parsed.success ? parsed.data.map((rule, id) => ({ ...rule, id })) : [];
}
