import * as z from "zod/mini";

import { requiredText } from "@/lib/schemas/form-rules";
import { blobResponseSchema } from "@/lib/schemas/responses";

export const passwordFormSchema = z.object({
  current: z.string().check(z.minLength(1, "Current password is required.")),
  password: z
    .string()
    .check(z.minLength(12, "New password must be at least 12 characters.")),
  code: z.string(),
});

export const alertPolicySchema = z.object({
  cpu: z.coerce.number().check(z.gte(1)).check(z.lte(100)),
  memory: z.coerce.number().check(z.gte(1)).check(z.lte(100)),
  disk: z.coerce.number().check(z.gte(1)).check(z.lte(100)),
  sustainedSeconds: z.coerce
    .number()
    .check(z.int())
    .check(z.gte(30))
    .check(z.lte(86400)),
  offlineSeconds: z.coerce
    .number()
    .check(z.int())
    .check(z.gte(30))
    .check(z.lte(86400)),
});

export const passphraseSchema = z.object({
  passphrase: z
    .string()
    .check(z.minLength(12, "Passphrase must be at least 12 characters.")),
});

export const totpCodeSchema = z.object({
  code: requiredText("Authenticator code"),
});

export const totpPasswordSchema = z.object({
  password: z.string().check(z.minLength(1, "Current password is required.")),
});

export const totpDisableSchema = z.extend(totpPasswordSchema, {
  code: requiredText("Authenticator or recovery code"),
});

export function dashboardHostnameSchema(acmeConfigured: boolean) {
  return z
    .object({
      version: z.coerce.number().check(z.int()).check(z.gte(0)),
      domain: requiredText("Dashboard hostname"),
      acmeEmail: z.union([z.literal(""), z.email()]),
      acceptTos: z.boolean(),
    })
    .check(
      z.check((context) => {
        const value = context.value;
        if (!acmeConfigured && !value.acceptTos)
          context.issues.push({
            code: "custom",
            path: ["acceptTos"],
            message: "Accept the certificate terms of service.",
            input: context.value,
          });
      }),
    );
}

export function updateFormSchema(version: string, destructive: boolean) {
  return z
    .object({
      planId: requiredText("Update plan"),
      passphrase: passphraseSchema.shape.passphrase,
      confirmation: z.string(),
      approveDataLoss: z.boolean(),
    })
    .check(
      z.check((context) => {
        const value = context.value;
        if (
          destructive &&
          (!value.approveDataLoss || value.confirmation !== version)
        )
          context.issues.push({
            code: "custom",
            message: `Approve data loss and type ${version} to confirm.`,
            input: context.value,
          });
      }),
    );
}

export const alertPolicyResponseSchema = z.object({
  cpu: z.number(),
  memory: z.number(),
  disk: z.number(),
  sustainedSeconds: z.number(),
  offlineSeconds: z.number(),
});

export const maintenanceResponseSchema = z.object({ enabled: z.boolean() });

export const buildInfoResponseSchema = z.object({
  version: z.string(),
  commit: z.string(),
  builtAt: z.string(),
  architecture: z.string(),
  updaterProtocol: z.number(),
});

export const dashboardAccessResponseSchema = z.object({
  version: z.number(),
  enabled: z.boolean(),
  origin: z.string(),
  candidateOrigin: z.string(),
  domain: z.string(),
  routeId: z.string(),
  activeDomain: z.string(),
  activeRouteId: z.string(),
  acmeConfigured: z.boolean(),
  acmeEmail: z.string(),
  status: z.optional(
    z.object({
      dns: z.string(),
      propagation: z.string(),
      certificate: z.string(),
      routing: z.string(),
      error: z.string(),
    }),
  ),
  error: z.optional(z.string()),
});

export const migrationDirectionResponseSchema = z.object({
  classification: z.enum(["non-destructive", "destructive", "unsupported"]),
  impact: z.string(),
});

export const migrationResponseSchema = z.object({
  version: z.number(),
  name: z.string(),
  up: migrationDirectionResponseSchema,
  down: migrationDirectionResponseSchema,
  upChecksum: z.string(),
  downChecksum: z.string(),
});

export const migrationStepResponseSchema = z.object({
  version: z.number(),
  direction: z.string(),
  checksum: z.string(),
  classification: z.string(),
  impact: z.string(),
});

export const migrationPlanResponseSchema = z.object({
  current: z.number(),
  target: z.number(),
  steps: z.array(migrationStepResponseSchema),
});

export const releaseManifestResponseSchema = z.object({
  format: z.optional(z.number()),
  version: z.string(),
  previous: z.string(),
  commit: z.optional(z.string()),
  builtAt: z.optional(z.string()),
  coreImage: z.string(),
  executorImage: z.string(),
  architectures: z.optional(z.array(z.string())),
  schema: z.number(),
  updaterProtocol: z.optional(z.number()),
  postgresMajor: z.optional(z.number()),
  minimumDocker: z.optional(z.number()),
  minimumCompose: z.optional(z.string()),
  migrations: z.array(migrationResponseSchema),
  assets: z.optional(z.record(z.string(), z.string())),
  notes: z.optional(z.string()),
});

export const versionChangePlanResponseSchema = z.object({
  id: z.string(),
  revision: z.number(),
  current: releaseManifestResponseSchema,
  target: releaseManifestResponseSchema,
  migrations: migrationPlanResponseSchema,
  destructive: z.boolean(),
  expires: z.string(),
});

export const versionChangeOperationResponseSchema = z.object({
  id: z.string(),
  actor: z.optional(z.string()),
  state: z.string(),
  error: z.string(),
  plan: versionChangePlanResponseSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  backup: z.optional(z.string()),
  backupHash: z.optional(z.string()),
});

export const systemUpdatesResponseSchema = z.object({
  enabled: z.boolean(),
  reason: z.optional(z.string()),
  version: buildInfoResponseSchema,
  installation: z.optional(
    z.object({
      revision: z.number(),
      release: releaseManifestResponseSchema,
    }),
  ),
  releases: z.pipe(
    z.nullable(z.array(releaseManifestResponseSchema)),
    z.transform((value) => value ?? []),
  ),
  operation: z.optional(versionChangeOperationResponseSchema),
});

export const userResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  admin: z.boolean(),
  disabled: z.boolean(),
  totp: z.boolean(),
});

// TODO(openapi): document history category and TOTP recovery responses.
export const historyResponseSchema = z.array(
  z.record(z.string(), z.union([z.string(), z.number()])),
);

export const totpRecoveryResultResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});

export const getUsersResponseSchema = z.array(userResponseSchema);

export const downloadBackupResponseSchema = blobResponseSchema;

export const regenerateRecoveryCodesResponseSchema = z.object({
  secret: z.string(),
  url: z.string(),
});

export const downloadUpdateBackupResponseSchema = blobResponseSchema;
