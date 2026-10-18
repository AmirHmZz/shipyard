import * as z from "zod";

const subdomain = (base: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, context) => {
      if (value === base || value.endsWith(`.${base}`))
        context.addIssue({
          code: "custom",
          message:
            "Enter only the subdomain; leave it blank for the zone itself.",
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
        context.addIssue({
          code: "custom",
          message:
            "Enter a valid relative subdomain, such as api, api.dev, or *.apps.",
        });
      if (`${value ? `${value}.` : ""}${base}`.length > 253)
        context.addIssue({
          code: "custom",
          message: "The full hostname is too long.",
        });
    });

export function relativeHostname(domain: string, zone: string): string {
  if (domain === zone) return "";
  return domain.endsWith(`.${zone}`)
    ? domain.slice(0, -zone.length - 1)
    : domain;
}

export function routeHostname(relative: string, zone: string): string {
  const base = z
    .string()
    .trim()
    .min(1, "Select a connected zone")
    .parse(zone)
    .toLowerCase();
  const value = subdomain(base).parse(relative);
  return value ? `${value}.${base}` : base;
}
