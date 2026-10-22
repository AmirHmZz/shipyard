import * as z from "zod/mini";

import { certificateSummaryResponseSchema } from "@/lib/schemas/certificates";
import { dnsRecordResponseSchema } from "@/lib/schemas/dns";
import { requiredText } from "@/lib/schemas/form-rules";

export const dnsRecordFormSchema = z.looseObject({
  type: requiredText("Record type"),
  name: requiredText("Record name"),
  content: requiredText("Record content"),
  ttl: z.coerce
    .number()
    .check(z.int())
    .check(z.gte(1, "TTL must be positive.")),
  proxied: z.optional(z.boolean()),
  data: z.optional(z.json()),
});

export const getDNSRecordsResponseSchema = z.array(dnsRecordResponseSchema);

export const getZoneCertificatesResponseSchema = z.array(
  certificateSummaryResponseSchema,
);
