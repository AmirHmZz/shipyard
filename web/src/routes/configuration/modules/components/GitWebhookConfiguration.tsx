import { resourceKeys } from "@/lib/query-keys";
import { createGitWebhook } from "../services";
import type { Status } from "../generics";
import { CopyButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { type Resource } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function GitWebhookConfiguration({
  existing,
  provider,
  status,
  busy,
  perform,
  setSecret,
  secret,
  client,
}: {
  existing: Resource;
  provider: string;
  status: { data: Status; refetch: () => Promise<unknown> };
  busy: boolean;
  perform: (action: () => Promise<void>) => Promise<void>;
  setSecret: (secret: string) => void;
  secret: string;
  client: ReturnType<typeof useQueryClient>;
}) {
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
            onClick={() =>
              void perform(async () => {
                const v = await createGitWebhook(existing.id);
                setSecret(v.secret);
                await Promise.all([
                  status.refetch(),
                  client.invalidateQueries({ queryKey: resourceKeys.all }),
                ]);
              })
            }
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
