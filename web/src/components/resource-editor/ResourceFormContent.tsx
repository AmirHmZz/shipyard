import { lazy, Suspense } from "react";
import { Link } from "react-router";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ConfigurationSurface";
import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { useResourceOptions } from "@/components/resource-forms/Options";
import { SelectControl } from "@/components/SelectControl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { loadComposeEditor } from "@/lib/feature-loaders";

import type { ResourceFormViewOptions } from "./types";

import { ResourceSchemaFields } from "./fields/ResourceSchemaFields";
import { RouteFields } from "./fields/RouteFields";
import { ZoneFields } from "./fields/ZoneFields";
import { useResourceFormView } from "./useResourceFormView";
const ComposeEditor = lazy(loadComposeEditor);
export type ResourceFormContentProps = ResourceFormViewOptions;
export function ResourceFormContent(props: ResourceFormContentProps) {
  const { open, onOpenChange, kind, resources, existing } = props;
  const options = useResourceOptions();
  const { state, derived, handlers } = useResourceFormView(props, options);
  const {
    name,
    parent,
    project,
    team,
    data,
    secrets,
    busy,
    error,
    dnsTesting,
    dnsVerified,
    composeYAML,
  } = state;
  const {
    formId,
    parentKind,
    parentLabel,
    parentOptions,
    needsDNSTest,
    needsComposeDocument,
    availableZones,
    services,
    repos,
    branches,
    selectableZones,
    projectOptions,
    teamOptions,
    kindLabel,
    saveLabel,
    namePlaceholder,
    parentPlaceholder,
    parentDisabled,
    saveDisabled,
  } = derived;
  const {
    setParent,
    setProject,
    setTeam,
    submit,
    changeName,
    changeCompose,
    testProvider,
    close,
  } = handlers;
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={`max-h-[90vh] overflow-y-auto ${kind === "application" && data.source === "compose" ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
        >
          <DialogHeader>
            <DialogTitle>
              {existing ? "Edit" : "New"} {kindLabel}
            </DialogTitle>
            <DialogDescription>
              {existing
                ? "Changes take effect on the next deployment unless they update a route."
                : "Configure a resource in your deployment workspace."}{" "}
              Credentials are encrypted and never returned.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-5">
            {kind !== "zone" && kind !== "route" && (
              <InputField
                label={<>Name</>}
                labelProps={{ htmlFor: `${formId}-name` }}
                inputProps={{
                  id: `${formId}-name`,
                  value: name,
                  onChange: changeName,
                  required: true,
                  autoFocus: true,
                  placeholder: namePlaceholder,
                }}
              />
            )}
            {kind === "application" && !existing && (
              <FormField
                label={<>Project</>}
                labelProps={{ htmlFor: `${formId}-project` }}
              >
                {
                  <SelectControl
                    value={project || undefined}
                    onValueChange={setProject}
                    options={projectOptions}
                    placeholder={"Select project"}
                    disabled={false}
                    triggerProps={{
                      id: `${formId}-project`,
                      className: "w-full",
                      "aria-label": "Select project",
                    }}
                  />
                }
              </FormField>
            )}
            {parentKind && (
              <FormField
                label={<>{parentLabel}</>}
                labelProps={{ htmlFor: `${formId}-parent` }}
              >
                {
                  <SelectControl
                    value={parent || undefined}
                    onValueChange={setParent}
                    options={parentOptions}
                    placeholder={parentPlaceholder}
                    disabled={parentDisabled}
                    triggerProps={{
                      id: `${formId}-parent`,
                      className: "w-full",
                      "aria-label": parentPlaceholder,
                    }}
                  />
                }
              </FormField>
            )}
            {kind === "zone" && (
              <ZoneFields
                availableZones={availableZones}
                selectableZones={selectableZones}
              />
            )}
            {kind === "route" && (
              <RouteFields resources={resources} services={services} />
            )}
            {kind === "webhook" && (
              <FormField
                label={<>Team (optional for platform-wide alerts)</>}
                labelProps={{}}
              >
                {
                  <SelectControl
                    value={team || undefined}
                    onValueChange={setTeam}
                    options={teamOptions}
                    placeholder={"Platform-wide"}
                    disabled={false}
                    triggerProps={{
                      id: undefined,
                      className: "w-full",
                      "aria-label": "Platform-wide",
                    }}
                  />
                }
              </FormField>
            )}
            <Separator />
            {kind === "server" && data.connection === "local" && (
              <Alert>
                <AlertDescription>
                  Local Docker access is managed by the installation. No SSH
                  credentials or provisioning are needed.
                </AlertDescription>
              </Alert>
            )}
            <ResourceSchemaFields
              kind={kind}
              resources={resources}
              existing={existing}
              services={services}
              repos={repos}
              branches={branches}
            />
            {kind === "application" &&
              data.source === "compose" &&
              existing?.data.source === "compose" && (
                <section className="flex flex-col gap-3 border-t pt-5">
                  <p className="text-sm text-muted-foreground">
                    Manage the saved Docker Compose document in the
                    application's Compose tab.
                  </p>
                  <Button className="self-start" variant="outline" asChild>
                    <Link to={`/applications/${existing.id}?tab=compose`}>
                      Open Compose editor
                    </Link>
                  </Button>
                </section>
              )}
            {needsComposeDocument && (
              <section
                className="min-w-0 flex flex-col gap-2"
                aria-label="Direct Compose source"
              >
                <Label>Compose YAML</Label>
                <p className="text-xs text-muted-foreground">
                  Paste one Compose document. Use images or dockerfile_inline
                  builds; referenced host files need absolute paths. The
                  document is encrypted and visible only to operators.
                </p>
                <Suspense fallback={<p>Loading editor…</p>}>
                  <ComposeEditor
                    value={composeYAML}
                    onChange={changeCompose}
                    disabled={busy}
                  />
                </Suspense>
              </section>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {needsDNSTest && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={dnsTesting || busy || !secrets.token?.trim()}
                  onClick={testProvider}
                >
                  {dnsTesting && <Spinner className="size-4" />}
                  {dnsTesting ? "Testing provider…" : "Test provider"}
                </Button>
                <p role="status" className="text-sm text-muted-foreground">
                  {dnsVerified
                    ? "Connection verified. Provider is ready to save."
                    : "Test your API token before saving this provider."}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveDisabled}>
                {busy && <Spinner className="size-4" />}Save {saveLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
