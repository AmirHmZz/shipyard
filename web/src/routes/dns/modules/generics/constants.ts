export const dnsKeys = {
  records: (zoneId: string) => ["records", zoneId] as const,
  certificates: (zoneId: string) => ["zone-certificates", zoneId] as const,
};
