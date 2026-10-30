import { useId, useRef } from "react";

import type { Resource } from "@/lib/api/types";

import { ResourceLogo } from "@/components/ResourceLogo";
import { Button } from "@/components/ui/button";
import { useResourceLogoEditor } from "@/lib/hooks/useResourceLogoEditor";
import { useResources } from "@/lib/hooks/useResources";

export type ResourceLogoEditorProps = { resource: Resource };

export function ResourceLogoEditor({ resource }: ResourceLogoEditorProps) {
  const { data } = useResources();
  const current = data?.find((row) => row.id === resource.id) || resource;
  const { busy, error, selectFile, removeLogo } = useResourceLogoEditor(
    resource.id,
  );
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const disabled = busy || !current.canWrite || !!current.data.deleting;
  function openFilePicker() {
    input.current?.click();
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Logo</span>
      <div className="flex flex-wrap items-center gap-3">
        <ResourceLogo resource={current} />
        <input
          ref={input}
          id={id}
          aria-label="Logo image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={selectFile}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={openFilePicker}
        >
          {current.logoUrl ? "Replace logo" : "Upload logo"}
        </Button>
        {current.logoUrl && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={removeLogo}
          >
            Remove logo
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        PNG, JPEG, or WebP, up to 2 MiB. Logo changes save immediately.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
