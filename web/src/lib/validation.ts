import * as z from "zod";

import {
  fields,
  parents,
  type ResourceKind,
} from "../components/resource-forms/definitions";

export const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

export const jsonText = z.string().transform((value, context) => {
  try {
    return z.json().parse(JSON.parse(value || "{}"));
  } catch {
    context.addIssue({ code: "custom", message: "Enter valid JSON." });
    return z.NEVER;
  }
});

export const csvText = z.string().transform((value) =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean),
);

export const authFormSchema = (mode: "login" | "setup" | "accept") =>
  z.object({
    email: mode === "accept" ? z.string() : z.email(),
    password: z.string().min(mode === "setup" ? 12 : 1, "Enter a password."),
    name: mode === "login" ? z.string() : requiredText("Full name"),
    code: z.string(),
    token:
      mode === "setup" || mode === "accept"
        ? requiredText("Token")
        : z.string(),
  });

export const passwordFormSchema = z.object({
  current: z.string().min(1, "Current password is required."),
  password: z.string().min(12, "New password must be at least 12 characters."),
  code: z.string(),
});

export const alertPolicySchema = z.object({
  cpu: z.number().min(1).max(100),
  memory: z.number().min(1).max(100),
  disk: z.number().min(1).max(100),
  sustainedSeconds: z.number().int().min(30).max(86400),
  offlineSeconds: z.number().int().min(30).max(86400),
});

export const passphraseSchema = z.object({
  passphrase: z.string().min(12, "Passphrase must be at least 12 characters."),
});

export const totpCodeSchema = z.object({
  code: requiredText("Authenticator code"),
});

export const totpPasswordSchema = z.object({
  password: z.string().min(1, "Current password is required."),
});

export const totpDisableSchema = totpPasswordSchema.extend({
  code: requiredText("Authenticator or recovery code"),
});

export const invitationFormSchema = z
  .object({
    email: z.email(),
    role: z.enum(["member", "owner", "operator", "viewer"]),
    projectId: z.string(),
  })
  .superRefine((value, context) => {
    if (value.projectId && value.role === "member")
      context.addIssue({
        code: "custom",
        path: ["role"],
        message: "Select a project role.",
      });
  });

export const dnsRecordFormSchema = z.looseObject({
  type: requiredText("Record type"),
  name: requiredText("Record name"),
  content: requiredText("Record content"),
  ttl: z.number().int().min(1, "TTL must be positive."),
  proxied: z.boolean().optional(),
  data: z.json().optional(),
});

export const dnsCredentialSchema = z.object({
  provider: z.enum(["cloudflare", "arvancloud"]),
  token: z
    .string()
    .refine(
      (value) => value.trim().length > 0,
      "DNS provider token is required.",
    ),
});

export const networkFormSchema = z
  .object({
    name: requiredText("Network name"),
    server: requiredText("Server"),
    mode: z.enum(["create", "existing"]),
    selected: z.string(),
    subnet: z.string(),
    range: z.string(),
    v6: z.boolean(),
    subnet6: z.string(),
  })
  .superRefine((value, context) => {
    if (value.mode === "existing" && !value.selected)
      context.addIssue({
        code: "custom",
        path: ["selected"],
        message: "Select a Docker network.",
      });
  });

export const previewFormSchema = z
  .object({
    enabled: z.boolean(),
    domain: z.string().trim(),
    zone: z.string(),
  })
  .superRefine((value, context) => {
    if (value.enabled && !value.zone)
      context.addIssue({
        code: "custom",
        path: ["zone"],
        message: "Select a connected zone.",
      });
    if (value.enabled && !value.domain)
      context.addIssue({
        code: "custom",
        path: ["domain"],
        message: "Enter a preview domain.",
      });
  });

export const dashboardHostnameSchema = (acmeConfigured: boolean) =>
  z
    .object({
      version: z.number().int().nonnegative(),
      domain: requiredText("Dashboard hostname"),
      acmeEmail: z.union([z.literal(""), z.email()]),
      acceptTos: z.boolean(),
    })
    .superRefine((value, context) => {
      if (!acmeConfigured && !value.acceptTos)
        context.addIssue({
          code: "custom",
          path: ["acceptTos"],
          message: "Accept the certificate terms of service.",
        });
    });

export const variableFormSchema = z.object({
  name: z
    .string()
    .regex(
      /^(env|build|preview-env|preview-build):[A-Za-z_][A-Za-z0-9_]*$/,
      "Enter a valid variable name.",
    ),
  value: z.string(),
  encrypted: z.boolean(),
});

export const serverConnectionSchema = z.object({
  host: requiredText("SSH host"),
  port: z.coerce.number<number>().int().min(1).max(65535),
  user: requiredText("SSH user"),
  fingerprint: requiredText("Verified host fingerprint"),
  authMethod: z.enum(["private_key", "password"]),
  credential: z.string(),
});

export const serverDeletionSchema = (serverName: string) =>
  z.object({
    planId: requiredText("Deletion plan"),
    name: z.literal(serverName, { error: "Type the server name to confirm." }),
    deleteVolumes: z.literal(true, { error: "Confirm volume deletion." }),
  });

export const updateFormSchema = (version: string, destructive: boolean) =>
  z
    .object({
      planId: requiredText("Update plan"),
      passphrase: passphraseSchema.shape.passphrase,
      confirmation: z.string(),
      approveDataLoss: z.boolean(),
    })
    .superRefine((value, context) => {
      if (
        destructive &&
        (!value.approveDataLoss || value.confirmation !== version)
      )
        context.addIssue({
          code: "custom",
          message: `Approve data loss and type ${version} to confirm.`,
        });
    });

export const previewCommitSchema = z.object({
  sha: z
    .string()
    .trim()
    .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i, "Enter a full commit SHA."),
});

export const freshDeploySchema = (name: string) =>
  z.object({
    fresh: z.literal(true),
    confirmName: z.literal(name, {
      error: "Type the application name to confirm.",
    }),
    version: z.number().int().nonnegative(),
  });

export const resourceDeletionSchema = (name: string) =>
  z.object({
    name: z.literal(name, { error: "Type the resource name to confirm." }),
  });

export const composeSourceSchema = z.looseObject({
  yaml: z
    .string()
    .refine(
      (value) => value.trim().length > 0,
      "Compose document is required.",
    ),
  version: z.number().int().nonnegative(),
});

const networkConnectionSchema = z.object({
  networkId: z.string(),
  ipv4: z.string().optional(),
  ipv6: z.string().optional(),
});

const publishedPortSchema = z.object({
  host: z.string(),
  published: z.number().int().min(1).max(65535),
  target: z.number().int().min(1).max(65535),
  protocol: z.string(),
});

export const networkingPayloadSchema = z.object({
  version: z.number().int().nonnegative(),
  services: z.record(
    z.string(),
    z.looseObject({
      hostname: z.string().optional(),
      connections: z.array(networkConnectionSchema),
    }),
  ),
});

export const publishedPortsPayloadSchema = z.object({
  version: z.number().int().nonnegative(),
  services: z.record(z.string(), z.array(publishedPortSchema)),
});

export const haproxySettingsSchema = z.object({
  version: z.number().int().nonnegative(),
  bindings: z.record(
    z.string(),
    z
      .array(
        z
          .string()
          .refine(
            (value) => value.trim().length > 0,
            "Binding address is required.",
          ),
      )
      .min(1),
  ),
});

export const gitSetupSchema = z
  .object({
    provider: z.enum(["github", "gitea"]),
    name: requiredText("Connection name"),
    owner: z.string(),
    instanceId: z.string(),
  })
  .superRefine((value, context) => {
    if (value.provider === "gitea" && !value.instanceId)
      context.addIssue({
        code: "custom",
        path: ["instanceId"],
        message: "Select a Gitea instance.",
      });
  });

export const giteaInstanceSchema = z
  .object({
    id: z.string(),
    name: requiredText("Instance name"),
    url: z.url("Enter a valid instance URL."),
    clientId: requiredText("Client ID"),
    clientSecret: z.string(),
  })
  .superRefine((value, context) => {
    if (!value.id && !value.clientSecret)
      context.addIssue({
        code: "custom",
        path: ["clientSecret"],
        message: "Client secret is required.",
      });
  });

export const httpReadinessChecksSchema = z
  .array(
    z.object({
      service: z.string().trim().min(1, "Enter a readiness service."),
      port: z.number().int().min(1).max(65535),
      path: z
        .string()
        .startsWith("/")
        .refine((v) => !/[\r\n]/.test(v), "Invalid readiness path."),
    }),
  )
  .superRefine((checks, context) => {
    const seen = new Set<string>();
    for (const check of checks) {
      const key = JSON.stringify(check);
      if (seen.has(key))
        context.addIssue({
          code: "custom",
          message: "Duplicate HTTP readiness check.",
        });
      seen.add(key);
    }
  });
export const previewRoutingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("inherit") }),
  z.object({ mode: z.literal("private") }),
  z.object({
    mode: z.literal("target"),
    service: z.string().trim().min(1, "Enter a preview service."),
    port: z.number().int().min(1).max(65535),
  }),
]);

export function parseResourceForm(input: {
  kind: ResourceKind;
  name: string;
  parentId: string;
  teamId: string;
  data: Record<string, unknown>;
  secrets: Record<string, string>;
  version: number;
}) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields[input.kind]) {
    if (field.type === "readiness")
      shape[field.key] = httpReadinessChecksSchema.optional();
    else if (field.type === "previewRouting")
      shape[field.key] = previewRoutingSchema.optional();
    else if (field.type === "json")
      shape[field.key] = z
        .union([
          jsonText,
          z.json().refine((value) => typeof value !== "string"),
        ])
        .optional();
    else if (field.type === "csv")
      shape[field.key] = z.union([csvText, z.array(z.string())]).optional();
    else if (field.type === "number")
      shape[field.key] = z.number().finite().optional();
    else if (field.type === "switch") shape[field.key] = z.boolean().optional();
    else if (field.options)
      shape[field.key] = z
        .enum(field.options as [string, ...string[]])
        .optional();
    else shape[field.key] = z.string().optional();
  }
  const data = z.object(shape).catchall(z.unknown()).parse(input.data);
  return z
    .object({
      kind: z.enum([
        "team",
        "project",
        "environment",
        "server",
        "git",
        "dns",
        "zone",
        "application",
        "route",
        "webhook",
      ]),
      name: input.kind === "route" ? z.string() : requiredText("Name"),
      parentId: parents[input.kind]
        ? requiredText("Parent resource")
        : z.string(),
      teamId: z.string(),
      data: z.record(z.string(), z.unknown()),
      secrets: z.record(z.string(), z.string()),
      version: z.number().int().nonnegative(),
    })
    .superRefine((value, context) => {
      if (
        value.kind === "application" &&
        data.source !== "compose" &&
        !data.branch
      )
        context.addIssue({
          code: "custom",
          path: ["data", "branch"],
          message: "Select a repository branch.",
        });
    })
    .parse({ ...input, data });
}
