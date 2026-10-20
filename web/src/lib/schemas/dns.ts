import * as z from "zod/mini";

import { DNS_PROVIDERS } from "@/lib/enums";

export const dnsCredentialSchema = z.object({
  provider: z.enum(DNS_PROVIDERS),
  token: z
    .string()
    .check(
      z.refine(
        (value) => value.trim().length > 0,
        "DNS provider token is required.",
      ),
    ),
});

export const dnsRecordResponseSchema = z.object({
  id: z.optional(z.string()),
  type: z.string(),
  name: z.string(),
  content: z.string(),
  ttl: z.number(),
  proxied: z.boolean(),
  priority: z.optional(z.number()),
  data: z.optional(z.unknown()),
  extra: z.optional(z.unknown()),
});
