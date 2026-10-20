import type * as z from "zod/mini";

import type { dnsRecordFormSchema } from "./schema";
export type DNSRecordFormValues = z.infer<typeof dnsRecordFormSchema>;
