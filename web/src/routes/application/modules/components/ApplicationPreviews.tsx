import { useState } from "react";
import { Link } from "react-router";

import { PreviewRoutingFields } from "@/components/preview-routing-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { errorMessage, type Resource, text, useResources } from "@/lib/api";
import {
  normalizeApplicationSettings,
  type PreviewRouting,
} from "@/lib/application-settings";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { previewRoutingSchema } from "@/lib/validation";
import { previewFormSchema } from "@/lib/validation";

import {
  useSaveApplicationPreview,
  useCreateApplicationPreview,
} from "../hooks";
export function ApplicationPreviews({ app }: { app: Resource }) {
  const changes = useConfigurationChanges();
  const q = useResources();
  const routes = (q.data || []).filter(
    (r) => r.kind === "route" && r.parentId === app.id,
  );
  const [routingDraft, setRouting] = useState<PreviewRouting | null>(null);
  const routing =
    routingDraft ??
    (normalizeApplicationSettings(app.data, routes)
      .previewRouting as PreviewRouting);
  const savePreview = useSaveApplicationPreview();
  const createPreview = useCreateApplicationPreview();
  const [enabled, setEnabled] = useState(!!app.data.previews);
  const [domain, setDomain] = useState(() => text(app.data, "previewDomain"));
  const [zone, setZone] = useState(() => text(app.data, "previewZoneId"));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const previews =
    q.data?.filter(
      (r) => r.kind === "application" && r.data.previewOf === app.id,
    ) || [];
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Pull request previews</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const preview = previewFormSchema.parse({
                  enabled: enabled && routing.mode !== "private",
                  domain,
                  zone,
                });
                const nextRouting = previewRoutingSchema.parse(routing);
                if (
                  enabled &&
                  nextRouting.mode === "inherit" &&
                  !routes.some((r) => r.data.protocol !== "tcp")
                )
                  throw new Error(
                    "Configure an explicit preview target or private previews when there are no HTTP/gRPC routes.",
                  );
                await savePreview.mutateAsync({
                  id: app.id,
                  payload: {
                    kind: app.kind,
                    name: app.name,
                    version: app.version,
                    data: {
                      ...normalizeApplicationSettings(app.data, routes),
                      previewRouting: nextRouting,
                      previews: enabled,
                      previewDomain: preview.domain,
                      previewZoneId: preview.zone,
                    },
                  },
                });
                changes.saved();
                setSaved(true);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <Label htmlFor="previews-enabled">Enable PR previews</Label>
              <Switch
                id="previews-enabled"
                checked={enabled}
                disabled={!app.canWrite}
                onCheckedChange={setEnabled}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Disabling previews cleans up existing preview workloads, routes
              and ephemeral data. Production volumes are preserved.
            </p>
            {enabled && (
              <>
                <PreviewRoutingFields
                  value={routing}
                  onChange={setRouting}
                  hasRoutes={routes.some((r) => r.data.protocol !== "tcp")}
                  disabled={!app.canWrite}
                />
                {routing.mode !== "private" && (
                  <>
                    <div className="space-y-2">
                      <Label>Connected zone</Label>
                      <Select
                        value={zone}
                        onValueChange={setZone}
                        disabled={!app.canWrite}
                      >
                        <SelectTrigger aria-label="Preview connected zone">
                          <SelectValue placeholder="Select zone" />
                        </SelectTrigger>
                        <SelectContent>
                          {q.data
                            ?.filter((r) => r.kind === "zone")
                            .map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {text(r.data, "domain")}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preview-wildcard">
                        Preview wildcard domain
                      </Label>
                      <Input
                        id="preview-wildcard"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="*.preview.example.com"
                        disabled={!app.canWrite}
                      />
                      <p className="text-xs text-muted-foreground">
                        PR #42 uses pr-42.
                        {domain.replace(/^\*\./, "") || "preview.example.com"}.
                        Preview variables are configured in the Variables tab.
                      </p>
                    </div>
                  </>
                )}
              </>
            )}
            <Button disabled={busy || !app.canWrite}>
              Save preview settings
            </Button>
            {saved && (
              <p className="text-sm text-primary">Preview settings saved.</p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>
      {previews.map((preview) => {
        const approving =
          createPreview.isPending && createPreview.variables?.id === preview.id;
        return (
          <Card key={preview.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <Link
                  className="font-medium hover:underline"
                  to={`/applications/${preview.id}`}
                >
                  {preview.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {preview.data.previewClosed
                    ? "Closed"
                    : preview.data.approvedSha === preview.data.previewSha
                      ? "Commit approved"
                      : "Awaiting exact-commit approval"}
                </p>
                <code className="text-xs">
                  {text(preview.data, "previewSha").slice(0, 12)}
                </code>
              </div>
              {app.canWrite &&
                !preview.data.previewClosed &&
                preview.data.approvedSha !== preview.data.previewSha && (
                  <Button
                    disabled={approving}
                    onClick={async () => {
                      if (approving) return;
                      try {
                        await createPreview.mutateAsync({
                          id: preview.id,
                          sha: preview.data.previewSha,
                        });
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  >
                    Approve this commit
                  </Button>
                )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
