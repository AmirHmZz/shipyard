import { Plus, Settings2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { ProviderName } from "@/components/provider-name";
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
import { describeError } from "@/lib/api/translate-error";
import { GIT_PROVIDERS } from "@/lib/enums";
import { text } from "@/lib/resource-fields";

import { useGitConnectionForm } from "../hooks";
import { GitConnectionActions } from "./GitConnectionActions";
import { GiteaInstanceEditor } from "./GiteaInstanceEditor";
import { GitWebhookConfiguration } from "./GitWebhookConfiguration";

export function GitConnection({
  existing,
  onClose,
  onManual,
}: {
  existing?: Resource;
  onClose: () => void;
  onManual: () => void;
}) {
  const { state, derived, handlers } = useGitConnectionForm(existing);
  const { provider, name, owner, instanceId, instanceForm } = state;
  const {
    busy,
    error,
    instances,
    config,
    status,
    callback,
    selected,
    secret,
    saveInstance,
    createWebhook,
  } = derived;
  const {
    resetErrors,
    setProvider,
    setName,
    setOwner,
    setInstanceId,
    setInstanceForm,
    connect,
  } = handlers;
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
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="git-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GIT_PROVIDERS.map((v) => (
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
                  {describeError(instances.error)}
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
                saveInstance={saveInstance}
                resetErrors={resetErrors}
                setInstanceId={setInstanceId}
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
            provider={provider}
            status={{ data: status.data }}
            busy={busy}
            createWebhook={createWebhook}
            resetErrors={resetErrors}
            secret={secret}
          />
        )}
        {(error || status.error || config.error) && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">
              {error || describeError(status.error || config.error)}
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
