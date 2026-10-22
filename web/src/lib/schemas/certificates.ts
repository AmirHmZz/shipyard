import * as z from "zod/mini";

export const certificateSummaryResponseSchema = z.object({
  ownerType: z.enum(["application", "dashboard"]),
  routeId: z.string(),
  applicationId: z.string(),
  domain: z.string(),
  certificateDomain: z.string(),
  status: z.string(),
  hasCertificate: z.boolean(),
  issuer: z.string(),
  names: z.array(z.string()),
  validFrom: z.union([z.null(), z.string()]),
  expiresAt: z.union([z.null(), z.string()]),
  renewalAt: z.union([z.null(), z.string()]),
  serialNumber: z.string(),
  fingerprint: z.string(),
  authority: z.string(),
  error: z.string(),
});
