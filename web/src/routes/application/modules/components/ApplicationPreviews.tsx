import type * as React from "react";

import type { Resource } from "@/lib/api/types";

import { FormField } from "@/components/FormField";
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
import { text } from "@/lib/resource-fields";

import { useApplicationPreviewsForm } from "../hooks";
import { PreviewCard } from "./PreviewCard";
export type ApplicationPreviewsProps = { app: Resource };
export function ApplicationPreviews({ app }: ApplicationPreviewsProps) {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setDomain(e.target.value);
  }

  const { state, derived, handlers } = useApplicationPreviewsForm(app);
  const { enabled, domain, zone } = state;
  const { q, routes, routing, error, saved, busy, previewRows } = derived;
  const {
    setRouting,
    setEnabled,
    setDomain,
    setZone,
    saveSettings,
    handleApproval,
  } = handlers;
  return (
    <div className="flex flex-col gap-5" onClick={handleApproval}>
      <Card>
        <CardHeader>
          <CardTitle>Pull request previews</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={saveSettings}>
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
                    <FormField label={<>Connected zone</>} labelProps={{}}>
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
                    </FormField>
                    <FormField
                      label={<>Preview wildcard domain</>}
                      labelProps={{ htmlFor: "preview-wildcard" }}
                    >
                      <Input
                        id="preview-wildcard"
                        value={domain}
                        onChange={handleInputChange}
                        placeholder="*.preview.example.com"
                        disabled={!app.canWrite}
                      />
                      <p className="text-xs text-muted-foreground">
                        PR #42 uses pr-42.
                        {domain.replace(/^\*\./, "") || "preview.example.com"}.
                        Preview variables are configured in the Variables tab.
                      </p>
                    </FormField>
                  </>
                )}
              </>
            )}
            <Button className="self-start" disabled={busy || !app.canWrite}>
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
      {previewRows.map(({ preview, approving }) => (
        <PreviewCard
          key={preview.id}
          preview={preview}
          approving={approving}
          canWrite={app.canWrite}
        />
      ))}
    </div>
  );
}
