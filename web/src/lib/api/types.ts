import type * as z from "zod/mini";

import type { certificateSummaryResponseSchema } from "@/lib/schemas/certificates";
import type { deploymentResponseSchema } from "@/lib/schemas/deployments";
import type { dnsRecordResponseSchema } from "@/lib/schemas/dns";
import type { metricResponseSchema } from "@/lib/schemas/metrics";
import type { resourceResponseSchema } from "@/lib/schemas/resources";
import type { sessionResponseSchema } from "@/lib/schemas/session";

export type Resource = z.infer<typeof resourceResponseSchema>;
export type Deployment = z.infer<typeof deploymentResponseSchema>;
export type Session = z.infer<typeof sessionResponseSchema>;
export type Metric = z.infer<typeof metricResponseSchema>;
export type DNSRecord = z.infer<typeof dnsRecordResponseSchema>;
export type CertificateSummary = z.infer<
  typeof certificateSummaryResponseSchema
>;
