import * as z from "zod/mini";
function subdomain(base: string) {
  return z
    .string()
    .check(z.trim())
    .check(z.toLowerCase())
    .check(
      z.check((context) => {
        const value = context.value;
        if (value === base || value.endsWith(`.${base}`))
          context.issues.push({
            code: "custom",
            message:
              "Enter only the subdomain; leave it blank for the zone itself.",
            input: context.value,
          });
        const labels = (value.startsWith("*.") ? value.slice(2) : value).split(
          ".",
        );
        if (
          value &&
          value !== "*" &&
          labels.some(
            (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
          )
        )
          context.issues.push({
            code: "custom",
            message:
              "Enter a valid relative subdomain, such as api, api.dev, or *.apps.",
            input: context.value,
          });
        if (`${value ? `${value}.` : ""}${base}`.length > 253)
          context.issues.push({
            code: "custom",
            message: "The full hostname is too long.",
            input: context.value,
          });
      }),
    );
}
export function relativeHostname(domain: string, zone: string): string {
  if (domain === zone) return "";
  return domain.endsWith(`.${zone}`)
    ? domain.slice(0, -zone.length - 1)
    : domain;
}
export function routeHostname(relative: string, zone: string): string {
  return routeHostnameSchema.parse({ relative, zone });
}

export const routeHostnameSchema = z.pipe(
  z.object({
    relative: z.string(),
    zone: z
      .string()
      .check(z.trim())
      .check(z.minLength(1, "Select a connected zone"))
      .check(z.toLowerCase()),
  }),
  z.transform(({ relative, zone }, context) => {
    const parsed = subdomain(zone).safeParse(relative);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        context.issues.push({
          code: "custom",
          message: issue.message,
          input: relative,
        });
      return z.NEVER;
    }
    return parsed.data ? `${parsed.data}.${zone}` : zone;
  }),
);
