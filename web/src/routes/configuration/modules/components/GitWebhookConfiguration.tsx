import { CopyButton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import type { Status } from "../generics";
import type { useCreateGitWebhook } from "../hooks";

export function GitWebhookConfiguration({
  provider,
  status,
  busy,
  createWebhook,
  resetErrors,
  secret,
}: {
  provider: string;
  status: { data: Status };
  busy: boolean;
  createWebhook: ReturnType<typeof useCreateGitWebhook>;
  resetErrors: () => void;
  secret: string;
}) {
  function generateSecret() {
    if (busy) return;
    resetErrors();
    createWebhook.mutate();
  }
  return (
    <section
      aria-label="Webhook configuration"
      className="space-y-3 rounded-lg border p-4"
    >
      <h3 className="text-sm font-medium">
        {provider === "gitea" ? "Manual webhook setup" : "GitHub App webhook"}
      </h3>
      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
        <code className="w-full min-w-0 break-all text-xs sm:w-auto sm:flex-1">
          {status.data.webhookUrl}
        </code>
        <CopyButton label="Copy webhook URL" value={status.data.webhookUrl} />
      </div>
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
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Copy now; this secret is shown once. Update the Gitea webhook
                after replacing it.
              </p>
              <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
                <code className="w-full min-w-0 break-all text-xs sm:w-auto sm:flex-1">
                  {secret}
                </code>
                <CopyButton label="Copy signing secret" value={secret} />
              </div>
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
