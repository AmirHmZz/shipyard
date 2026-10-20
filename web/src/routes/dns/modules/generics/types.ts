import type * as z from "zod/mini";

import type { DNSRecord } from "@/lib/api/types";

import type { dnsKeys } from "./constants";
import type { dnsRecordFormSchema } from "./schema";
export type DNSRecordFormValues = z.infer<typeof dnsRecordFormSchema>;
export type RemovedDNSRecordSnapshot = {
  queryKey: ReturnType<typeof dnsKeys.records>;
  records: DNSRecord[] | undefined;
};
