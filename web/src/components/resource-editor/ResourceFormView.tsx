import { lazy, Suspense } from "react";
import { Link } from "react-router";

import type { ResourceFormProps } from "@/components/resource-forms/controller";
import type { ResourceKind } from "@/components/resource-forms/definitions";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/configuration-surface";
import { useResourceForm } from "@/components/resource-forms/controller";
import { ResourceOptions } from "@/components/resource-forms/options";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { loadComposeEditor } from "@/lib/feature-loaders";

import { ResourceSchemaFields } from "./fields/ResourceSchemaFields";
import { RouteFields } from "./fields/RouteFields";
import { ZoneFields } from "./fields/ZoneFields";
import { choose } from "./utils";

const ComposeEditor = lazy(loadComposeEditor);

export function ResourceFormView({
  open,
  onOpenChange,
  kind,
  resources,
  existing,
}: ResourceFormProps & { kind: ResourceKind }) {
  const {
    state: {
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
    },
    actions: {
      setName,
      setParent,
      setProject,
      setTeam,
      setData,
      setComposeYAML,
      save,
      testDNS,
      change,
    },
    meta: {
      formId,
      parentKind,
      parentLabel,
      parentOptions,
      needsDNSTest,
      needsComposeDocument,
    },
  } = useResourceForm();
  return (
    <ResourceOptions kind={kind} parent={parent} data={data} open={open}>
      {({ availableZones, services, repos, branches }) => {
        const registeredZones = new Set(
          resources
            .filter(
              (r) =>
                r.kind === "zone" &&
                r.parentId === parent &&
                r.id !== existing?.id,
            )
            .map((r) => r.data.providerZoneId),
        );
        const selectableZones = (availableZones.data || []).filter(
          (z) => !registeredZones.has(z.id),
        );
        return (
          <>
            <Dialog open={open} onOpenChange={onOpenChange}>
              <DialogContent
                className={`max-h-[90vh] overflow-y-auto ${kind === "application" && data.source === "compose" ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
              >
                <DialogHeader>
                  <DialogTitle>
                    {existing ? "Edit" : "New"}{" "}
                    {kind === "git"
                      ? "Git connection"
                      : kind === "dns"
                        ? "DNS provider"
                        : kind}
                  </DialogTitle>
                  <DialogDescription>
                    {existing
                      ? "Changes take effect on the next deployment unless they update a route."
                      : "Configure a resource in your deployment workspace."}{" "}
                    Credentials are encrypted and never returned.
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                  className="space-y-5"
                >
                  {kind !== "zone" && kind !== "route" && (
                    <div className="space-y-2">
                      <Label htmlFor={`${formId}-name`}>Name</Label>
                      <Input
                        id={`${formId}-name`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoFocus
                        placeholder={
                          kind === "project"
                            ? "e.g. Customer platform"
                            : kind === "server"
                              ? "e.g. Production · Frankfurt"
                              : "A descriptive name"
                        }
                      />
                    </div>
                  )}
                  {kind === "application" && !existing && (
                    <div className="space-y-2">
                      <Label htmlFor={`${formId}-project`}>Project</Label>
                      {choose(
                        project,
                        setProject,
                        resources
                          .filter((r) => r.kind === "project")
                          .map((r) => ({ value: r.id, label: r.name })),
                        "Select project",
                        false,
                        `${formId}-project`,
                      )}
                    </div>
                  )}
                  {parentKind && (
                    <div className="space-y-2">
                      <Label htmlFor={`${formId}-parent`}>{parentLabel}</Label>
                      {choose(
                        parent,
                        (value) => {
                          setParent(value);
                          if (kind === "zone") setData({});
                        },
                        parentOptions,
                        kind === "zone"
                          ? "Select DNS provider"
                          : `Select ${parentKind}`,
                        !!existing ||
                          (kind === "zone" && !parentOptions.length) ||
                          (kind === "application" && !parentOptions.length),
                        `${formId}-parent`,
                      )}
                    </div>
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
                    <div className="space-y-2">
                      <Label>Team (optional for platform-wide alerts)</Label>
                      {choose(
                        team,
                        setTeam,
                        resources
                          .filter((r) => r.kind === "team")
                          .map((r) => ({
                            value: r.id,
                            label:
                              r.kind === "zone"
                                ? String(r.data.domain)
                                : r.name,
                          })),
                        "Platform-wide",
                      )}
                    </div>
                  )}
                  <Separator />
                  {kind === "server" && data.connection === "local" && (
                    <Alert>
                      <AlertDescription>
                        Local Docker access is managed by the installation. No
                        SSH credentials or provisioning are needed.
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
                      <section className="space-y-3 border-t pt-5">
                        <p className="text-sm text-muted-foreground">
                          Manage the saved Docker Compose document in the
                          application's Compose tab.
                        </p>
                        <Button variant="outline" asChild>
                          <Link to={`/applications/${existing.id}?tab=compose`}>
                            Open Compose editor
                          </Link>
                        </Button>
                      </section>
                    )}
                  {needsComposeDocument && (
                    <section
                      className="min-w-0 space-y-2"
                      aria-label="Direct Compose source"
                    >
                      <Label>Compose YAML</Label>
                      <p className="text-xs text-muted-foreground">
                        Paste one Compose document. Use images or
                        dockerfile_inline builds; referenced host files need
                        absolute paths. The document is encrypted and visible
                        only to operators.
                      </p>
                      <Suspense fallback={<p>Loading editor…</p>}>
                        <ComposeEditor
                          value={composeYAML}
                          onChange={(yaml) => {
                            change();
                            setComposeYAML(yaml);
                          }}
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
                        onClick={() => void testDNS()}
                      >
                        {dnsTesting && <Spinner className="size-4 " />}
                        {dnsTesting ? "Testing provider…" : "Test provider"}
                      </Button>
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        {dnsVerified
                          ? "Connection verified. Provider is ready to save."
                          : "Test your API token before saving this provider."}
                      </p>
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        busy ||
                        (kind !== "zone" && kind !== "route" && !name) ||
                        (needsDNSTest && (!dnsVerified || dnsTesting)) ||
                        (kind === "zone" && !data.providerZoneId) ||
                        (kind === "zone" && !parent) ||
                        (needsComposeDocument && !composeYAML.trim())
                      }
                    >
                      {busy && <Spinner className="size-4 " />}Save{" "}
                      {kind === "git"
                        ? "connection"
                        : kind === "dns"
                          ? "provider"
                          : kind}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        );
      }}
    </ResourceOptions>
  );
}
