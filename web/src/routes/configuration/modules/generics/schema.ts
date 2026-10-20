import * as z from "zod/mini";

import { GIT_PROVIDERS } from "@/lib/enums";
import { requiredText } from "@/lib/schemas/form-rules";

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
  .check(
    z.check((context) => {
      const value = context.value;
      if (value.mode === "existing" && !value.selected)
        context.issues.push({
          code: "custom",
          path: ["selected"],
          message: "Select a Docker network.",
          input: context.value,
        });
    }),
  );

export const haproxySettingsSchema = z.object({
  version: z.coerce.number().check(z.int()).check(z.gte(0)),
  bindings: z.record(
    z.string(),
    z
      .array(
        z
          .string()
          .check(
            z.refine(
              (value) => value.trim().length > 0,
              "Binding address is required.",
            ),
          ),
      )
      .check(z.minLength(1)),
  ),
});

export const gitSetupSchema = z
  .object({
    provider: z.enum(GIT_PROVIDERS),
    name: requiredText("Connection name"),
    owner: z.string(),
    instanceId: z.string(),
  })
  .check(
    z.check((context) => {
      const value = context.value;
      if (value.provider === "gitea" && !value.instanceId)
        context.issues.push({
          code: "custom",
          path: ["instanceId"],
          message: "Select a Gitea instance.",
          input: context.value,
        });
    }),
  );

export const giteaInstanceSchema = z
  .object({
    id: z.string(),
    name: requiredText("Instance name"),
    url: z.url("Enter a valid instance URL."),
    clientId: requiredText("Client ID"),
    clientSecret: z.string(),
  })
  .check(
    z.check((context) => {
      const value = context.value;
      if (!value.id && !value.clientSecret)
        context.issues.push({
          code: "custom",
          path: ["clientSecret"],
          message: "Client secret is required.",
          input: context.value,
        });
    }),
  );

export const giteaInstanceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  clientId: z.string(),
  configured: z.boolean(),
});

export const gitSetupStartResponseSchema = z.object({
  connectionId: z.string(),
  url: z.string(),
  manifest: z.optional(z.record(z.string(), z.unknown())),
});

export const gitSetupStatusResponseSchema = z.object({
  state: z.string(),
  account: z.string(),
  webhookUrl: z.string(),
  signingSecretConfigured: z.boolean(),
  lastDelivery: z.union([z.null(), z.string()]),
});

export const haProxyFrontendResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  protocol: z.string(),
  applicationId: z.string(),
  applicationName: z.string(),
  ports: z.array(z.number()),
  addresses: z.array(z.string()),
  defaultAddresses: z.array(z.string()),
  useDefaults: z.boolean(),
});

export const haProxySettingsResponseSchema = z.object({
  version: z.number(),
  bindings: z.record(z.string(), z.array(z.string())),
  lastJobId: z.string(),
  appliedAt: z.union([z.null(), z.string()]),
  image: z.string(),
  frontends: z.array(haProxyFrontendResponseSchema),
  apply: z.union([
    z.null(),
    z.object({ id: z.string(), state: z.string(), error: z.string() }),
  ]),
});

export const gitSetupConfigResponseSchema = z.object({
  origin: z.string(),
  giteaCallback: z.string(),
});

export const haProxyUpdateResultResponseSchema = z.object({
  jobId: z.string(),
});

export { getDockerNetworksResponseSchema as dockerNetworkInventoryResponseSchema } from "@/lib/schemas/docker-networks";

export const gitWebhookSecretResultResponseSchema = z.object({
  secret: z.string(),
});

export const getGiteaInstancesResponseSchema = z.array(
  giteaInstanceResponseSchema,
);
