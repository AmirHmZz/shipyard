export function relativeHostname(domain: string, zone: string): string {
  if (domain === zone) return "";
  return domain.endsWith(`.${zone}`)
    ? domain.slice(0, -zone.length - 1)
    : domain;
}

export function routeHostname(relative: string, zone: string): string {
  const value = relative.trim().toLowerCase();
  const base = zone.toLowerCase();
  if (!base) throw Error("Select a connected zone");
  if (value === base || value.endsWith(`.${base}`))
    throw Error(
      "Enter only the subdomain; leave it blank for the zone itself.",
    );
  const labels = (value.startsWith("*.") ? value.slice(2) : value).split(".");
  if (
    value &&
    value !== "*" &&
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  )
    throw Error(
      "Enter a valid relative subdomain, such as api, api.dev, or *.apps.",
    );
  const domain = value ? `${value}.${base}` : base;
  if (domain.length > 253) throw Error("The full hostname is too long.");
  return domain;
}
