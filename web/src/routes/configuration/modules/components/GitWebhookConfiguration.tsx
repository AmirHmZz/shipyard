import { CopyValue } from "@/components/CopyValue";
import { Button } from "@/components/ui/button";

import type { Status } from "../generics";
import type { useCreateGitWebhook } from "../hooks";

export type GitWebhookConfigurationProps = {
  provider: string;
  status: { data: Status };
  busy: boolean;
  createWebhook: ReturnType<typeof useCreateGitWebhook>;
  resetErrors: () => void;
  secret: string;
};
export function GitWebhookConfiguration({
  provider,
  status,
  busy,
  createWebhook,
  resetErrors,
  secret,
}: GitWebhookConfigurationProps) {
  function generateSecret() {
    if (busy) return;
    resetErrors();
    createWebhook.mutate();
  }
  return (
    <section
      aria-label="Webhook configuration"
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h3 className="text-sm font-medium">
        {provider === "gitea" ? "Manual webhook setup" : "GitHub App webhook"}
      </h3>
      <CopyValue value={status.data.webhookUrl} label="Copy webhook URL" />
      <p className="text-xs text-muted-foreground">
        Events: push and pull_request. Use JSON payloads and the saved signing
        secret.
      </p>
      {provider === "gitea" && (
        <>
          <p className="text-xs text-muted-foreground">
            {status.data.signingSecretConfigured
              ? "A signing secret is saved."
              : "Generate a signing secret and copy it into your Gitea webhook."}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={generateSecret}
          >
            {status.data.signingSecretConfigured
              ? "Replace signing secret"
              : "Generate signing secret"}
          </Button>
          {secret && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Copy now; this secret is shown once. Update the Gitea webhook
                after replacing it.
              </p>
              <CopyValue value={secret} label="Copy signing secret" />
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Last accepted delivery:{" "}
        {status.data.lastDelivery
          ? new Date(status.data.lastDelivery).toLocaleString()
          : "None received"}
        . This does not verify the provider's webhook settings.
      </p>
    </section>
  );
}
