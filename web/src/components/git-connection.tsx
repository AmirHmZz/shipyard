import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { ProviderName } from "@/components/provider-name";
import { CopyButton } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage, post, text, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import type { components } from "@/lib/schema";
import { gitSetupSchema, giteaInstanceSchema } from "@/lib/validation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Settings2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
type InstanceDraft = {
  id: string;
  name: string;
  url: string;
  clientId: string;
  clientSecret: string;
};

type Instance = components["schemas"]["GiteaInstance"];
type Status = components["schemas"]["GitSetupStatus"];
type Start = components["schemas"]["GitSetupStart"];

function followGitSetup(result: Start) {
  if (result.manifest) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = result.url;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "manifest";
    input.value = JSON.stringify(result.manifest);
    form.append(input);
    document.body.append(form);
    form.submit();
  } else window.location.assign(result.url);
}

export function GitConnection({
  existing,
  onClose,
  onManual,
}: {
  existing?: Resource;
  onClose: () => void;
  onManual: () => void;
}) {
  const changes = useConfigurationChanges();
  const client = useQueryClient();
  const [provider, setProvider] = useState(() =>
    text(existing?.data || {}, "provider", "github"),
  );
  const [name, setName] = useState(existing?.name || "");
  const [owner, setOwner] = useState("");
  const [instanceId, setInstanceId] = useState(() =>
    text(existing?.data || {}, "instanceId"),
  );
  const [instanceForm, setInstanceForm] = useState<{
    id: string;
    name: string;
    url: string;
    clientId: string;
    clientSecret: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const instances = useQuery({
    queryKey: ["gitea-instances"],
    queryFn: () => api<Instance[]>("/git/gitea/instances"),
    enabled: provider === "gitea",
  });
  const config = useQuery({
    queryKey: ["git-setup-config"],
    queryFn: () =>
      api<{ origin: string; giteaCallback: string }>("/git/setup/config"),
  });
  const status = useQuery({
    queryKey: ["git-setup", existing?.id],
    queryFn: () => api<Status>(`/git/${existing!.id}/setup`),
    enabled: !!existing,
  });
  const callback = config.data?.giteaCallback || "";
  const selected = instances.data?.find((v) => v.id === instanceId);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    await perform(async () => {
      const result = existing
        ? await post<Start>(`/git/${existing.id}/reconnect`)
        : await post<Start>(
            "/git/setup/start",
            gitSetupSchema.parse({
              provider,
              name,
              owner,
              instanceId,
            }),
          );
      changes.saved();
      followGitSetup(result);
    });
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? existing.name : "Connect source control"}
          </DialogTitle>
          <DialogDescription>
            Authorize repository access. Git connections do not change your
            Shipyard login.
          </DialogDescription>
        </DialogHeader>
        {!existing && (
          <>
            <div className="space-y-2">
              <Label htmlFor="git-name">Connection name</Label>
              <Input
                id="git-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="git-provider">Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => {
                  setProvider(v);
                  setError("");
                  setInstanceForm(null);
                }}
              >
                <SelectTrigger id="git-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["github", "gitea"].map((v) => (
                    <SelectItem key={v} value={v}>
                      <ProviderName provider={v} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {existing && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ProviderName provider={provider} />
            <Badge variant="secondary">
              {status.data?.state || text(existing.data, "status", "manual")}
            </Badge>
          </div>
        )}
        {status.data?.account && (
          <p className="text-sm text-muted-foreground">
            Authorized account: {status.data.account}
          </p>
        )}
        {!existing && provider === "github" && (
          <>
            <p className="text-sm text-muted-foreground">
              Shipyard creates a GitHub App with repository Contents and Pull
              requests read access, plus push and pull_request events. Approve
              the App, then choose its repositories on GitHub.
            </p>
            <div className="space-y-2">
              <Label htmlFor="git-owner">Organization (optional)</Label>
              <Input
                id="git-owner"
                placeholder="Leave empty for your personal account"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
          </>
        )}
        {provider === "gitea" && (
          <>
            {!existing && (
              <div className="space-y-2">
                <Label htmlFor="gitea-instance">Gitea instance</Label>
                <Select
                  value={instanceId || undefined}
                  onValueChange={setInstanceId}
                >
                  <SelectTrigger id="gitea-instance" className="w-full">
                    <SelectValue placeholder="Select an instance" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.data?.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {instances.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {errorMessage(instances.error)}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setInstanceForm({
                    id: "",
                    name: "",
                    url: "",
                    clientId: "",
                    clientSecret: "",
                  })
                }
              >
                <Plus />
                Add instance
              </Button>
              {selected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setInstanceForm({ ...selected, clientSecret: "" })
                  }
                >
                  <Settings2 />
                  Edit instance
                </Button>
              )}
            </div>
            {instanceForm && (
              <GiteaInstanceEditor
                instanceForm={instanceForm}
                setInstanceForm={setInstanceForm}
                callback={callback}
                busy={busy}
                perform={perform}
                setInstanceId={setInstanceId}
                client={client}
              />
            )}
            <p className="text-sm text-muted-foreground">
              Browser authorization grants read-only repository access. You
              configure Gitea webhooks yourself; Shipyard never manages them
              remotely.
            </p>
          </>
        )}
        {existing && status.data && (
          <GitWebhookConfiguration
            existing={existing}
            provider={provider}
            status={{ data: status.data, refetch: status.refetch }}
            busy={busy}
            perform={perform}
            setSecret={setSecret}
            secret={secret}
            client={client}
          />
        )}
        {(error || status.error || config.error) && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">
              {error || errorMessage(status.error || config.error)}
            </AlertDescription>
          </Alert>
        )}
        <GitConnectionActions
          onManual={onManual}
          onClose={onClose}
          existing={existing}
          provider={provider}
          busy={busy}
          name={name}
          instanceId={instanceId}
          instanceForm={instanceForm}
          connect={connect}
        />
      </DialogContent>
    </Dialog>
  );
}

function GiteaInstanceEditor({
  instanceForm,
  setInstanceForm,
  callback,
  busy,
  perform,
  setInstanceId,
  client,
}: {
  instanceForm: InstanceDraft;
  setInstanceForm: Dispatch<SetStateAction<InstanceDraft | null>>;
  callback: string;
  busy: boolean;
  perform: (action: () => Promise<void>) => Promise<void>;
  setInstanceId: (id: string) => void;
  client: ReturnType<typeof useQueryClient>;
}) {
  return (
    <section
      aria-label="Gitea OAuth application"
      className="space-y-4 rounded-lg border p-4"
    >
      <p className="text-sm text-muted-foreground">
        Once per Gitea instance, register a confidential OAuth2 application
        under Settings → Applications. Use the callback URL below, then copy its
        client ID and client secret. Gitea 1.23 or newer is required.
      </p>
      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
        <code className="w-full min-w-0 break-all text-xs sm:w-auto sm:flex-1">
          {callback || "Loading callback URL…"}
        </code>
        {callback && (
          <CopyButton label="Copy OAuth callback URL" value={callback} />
        )}
      </div>
      {(
        [
          ["name", "Instance name"],
          ["url", "Instance URL"],
          ["clientId", "Client ID"],
          ["clientSecret", "Client secret"],
        ] as const
      ).map(([key, label]) => (
        <div className="space-y-2" key={key}>
          <Label htmlFor={`gitea-${key}`}>{label}</Label>
          <Input
            id={`gitea-${key}`}
            type={key === "clientSecret" ? "password" : "text"}
            autoComplete="off"
            value={instanceForm[key]}
            placeholder={
              key === "clientSecret" && instanceForm.id
                ? "Leave empty to keep saved secret"
                : undefined
            }
            onChange={(e) =>
              setInstanceForm((current) =>
                current ? { ...current, [key]: e.target.value } : current,
              )
            }
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const v = await api<Instance>("/git/gitea/instances", {
                method: "PUT",
                body: JSON.stringify(giteaInstanceSchema.parse(instanceForm)),
              });
              setInstanceId(v.id);
              setInstanceForm(null);
              await client.invalidateQueries({
                queryKey: ["gitea-instances"],
              });
            })
          }
        >
          Save instance
        </Button>
        <Button variant="outline" onClick={() => setInstanceForm(null)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function GitWebhookConfiguration({
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
                const v = await post<{ secret: string }>(
                  `/git/${existing.id}/webhook-secret`,
                );
                setSecret(v.secret);
                await Promise.all([
                  status.refetch(),
                  client.invalidateQueries({ queryKey: ["resources"] }),
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

function GitConnectionActions({
  onManual,
  onClose,
  existing,
  provider,
  busy,
  name,
  instanceId,
  instanceForm,
  connect,
}: {
  onManual: () => void;
  onClose: () => void;
  existing?: Resource;
  provider: string;
  busy: boolean;
  name: string;
  instanceId: string;
  instanceForm: InstanceDraft | null;
  connect: () => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
      <Button variant="ghost" onClick={onManual}>
        Advanced: manual credentials
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {(!existing ||
          (provider === "gitea" &&
            text(existing.data, "authMethod") === "oauth") ||
          (provider === "github" && !!text(existing.data, "appSlug"))) && (
          <Button
            disabled={
              busy ||
              (!existing &&
                (!name.trim() || (provider === "gitea" && !instanceId))) ||
              !!instanceForm
            }
            onClick={() => void connect()}
          >
            {busy ? <Spinner className="size-4 " /> : <ExternalLink />}
            {existing
              ? "Reconnect"
              : provider === "github"
                ? "Create GitHub App"
                : "Authorize Gitea"}
          </Button>
        )}
      </div>
    </div>
  );
}
