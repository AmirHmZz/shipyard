import type * as React from "react";

import { Plus, Settings2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ConfigurationSurface";
import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { ProviderName } from "@/components/ProviderName";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export type GitConnectionProps = {
  existing?: Resource;
  onClose: () => void;
  onManual: () => void;
};
export function GitConnection({
  existing,
  onClose,
  onManual,
}: GitConnectionProps) {
  function handleDialogOpenChange(open: boolean) {
    return !open && onClose();
  }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setName(e.target.value);
  }
  function handleInputChange2(e: React.ChangeEvent<HTMLInputElement>) {
    return setOwner(e.target.value);
  }
  function handleButtonClick() {
    return setInstanceForm({
      id: "",
      name: "",
      url: "",
      clientId: "",
      clientSecret: "",
    });
  }
  function handleButtonClick2() {
    if (selected) setInstanceForm({ ...selected, clientSecret: "" });
  }

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
    <Dialog open onOpenChange={handleDialogOpenChange}>
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
            <InputField
              label={<>Connection name</>}
              labelProps={{ htmlFor: "git-name" }}
              inputProps={{
                id: "git-name",
                value: name,
                onChange: handleInputChange,
              }}
            />
            <FormField
              label={<>Provider</>}
              labelProps={{ htmlFor: "git-provider" }}
            >
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
            </FormField>
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
            <InputField
              label={<>Organization (optional)</>}
              labelProps={{ htmlFor: "git-owner" }}
              inputProps={{
                id: "git-owner",
                placeholder: "Leave empty for your personal account",
                value: owner,
                onChange: handleInputChange2,
              }}
            />
          </>
        )}
        {provider === "gitea" && (
          <>
            {!existing && (
              <FormField
                label={<>Gitea instance</>}
                labelProps={{ htmlFor: "gitea-instance" }}
              >
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
              </FormField>
            )}
            {instances.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {describeError(instances.error)}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleButtonClick}>
                <Plus />
                Add instance
              </Button>
              {selected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleButtonClick2}
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
