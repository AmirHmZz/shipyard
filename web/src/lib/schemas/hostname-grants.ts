import * as z from "zod/mini";

const hostnameGrant = {
  mode: z.enum(["whole", "scoped"]),
  patterns: z.array(z.string()),
};
export const zoneGrantsSchema = z.array(
  z.object({ teamId: z.string(), ...hostnameGrant }),
);
export const applicationDomainAccessSchema = z.array(
  z.object({ zoneId: z.string(), domain: z.string(), ...hostnameGrant }),
);
export const zoneGrantModeSchema = z.enum(["none", "whole", "scoped"]);
export const zoneGrantInputSchema = z.object({
  mode: zoneGrantModeSchema,
  patterns: z.array(z.string()),
});
export type ZoneGrantInput = z.infer<typeof zoneGrantInputSchema>;
