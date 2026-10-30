import { Box, Layers3 } from "lucide-react";
import { useState } from "react";

import type { Resource } from "@/lib/api/types";

export type ResourceLogoProps = {
  resource: Resource;
};

export function ResourceLogo({ resource }: ResourceLogoProps) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const url = resource.logoUrl;
  const FallbackIcon = resource.kind === "project" ? Layers3 : Box;
  function handleError() {
    setFailedURL(url || null);
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
      {url && url !== failedURL ? (
        <img
          src={url}
          alt=""
          className="size-full object-contain p-1"
          onError={handleError}
        />
      ) : (
        <FallbackIcon className="size-5 text-primary" />
      )}
    </span>
  );
}
