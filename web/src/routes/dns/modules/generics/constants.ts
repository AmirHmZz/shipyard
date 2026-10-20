export const dnsKeys = {
  recordsPrefix: ["records"] as const,
  removal: ["remove-dns-record"] as const,
  records: (zoneId: string) => ["records", zoneId] as const,
  certificates: (zoneId: string) => ["zone-certificates", zoneId] as const,
};
