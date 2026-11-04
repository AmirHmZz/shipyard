import type { ComponentProps } from "react";

import { Box, Layers3 } from "lucide-react";
import { useState } from "react";

import type { Resource } from "@/lib/api/types";

export type ResourceLogoProps = {
  resource: Resource;
  reorderHandle?: Pick<ComponentProps<"button">, "ref" | "disabled" | "hidden">;
};

export function ResourceLogo({ resource, reorderHandle }: ResourceLogoProps) {
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const url = resource.logoUrl;
  const FallbackIcon = resource.kind === "project" ? Layers3 : Box;
  function handleError() {
    setFailedURL(url || null);
  }
  const logoClassName =
    "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40";
  const logo =
    url && url !== failedURL ? (
      <img
        src={url}
        alt=""
        draggable={false}
        className="size-full object-contain p-1"
        onError={handleError}
      />
    ) : (
      <FallbackIcon className="size-5 text-primary" aria-hidden="true" />
    );

  return (
    <>
      {(!reorderHandle || reorderHandle.hidden) && (
        <span data-slot="resource-logo" className={logoClassName}>
          {logo}
        </span>
      )}
      {/* Keep a handle mounted so dnd-kit never treats the whole card as the handle. */}
      {reorderHandle && (
        <button
          {...reorderHandle}
          type="button"
          aria-label={`Reorder ${resource.name}`}
          data-slot="resource-logo"
          className={
            reorderHandle.hidden
              ? "hidden"
              : `${logoClassName} relative z-10 cursor-default touch-none disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-ring`
          }
        >
          {!reorderHandle.hidden && logo}
        </button>
      )}
    </>
  );
}
