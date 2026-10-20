import type { FormEvent } from "react";

import { useReducer } from "react";

import type { Resource } from "@/lib/api/types";
import type { PreviewRouting } from "@/lib/application-settings";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { normalizeApplicationSettings } from "@/lib/application-settings";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useResources } from "@/lib/hooks/useResources";
import { previewRoutingSchema } from "@/lib/schemas/application";

import {
  initialPreviewState,
  previewReducer,
  previewFormSchema,
  previewApplicationRoutingSchema,
  previewCommitSchema,
} from "../generics";
import { useApprovePreview } from "./useApprovePreview";
import { useSaveApplicationPreview } from "./useSaveApplicationPreview";

export function useApplicationPreviewsForm(app: Resource) {
  const changes = useConfigurationChanges();
  const q = useResources();
  const routes = (q.data ?? []).filter(
    (resource) => resource.kind === "route" && resource.parentId === app.id,
  );
  const [state, dispatch] = useReducer(
    previewReducer,
    app,
    initialPreviewState,
  );
  const savedRouting = previewRoutingSchema.safeParse(
    normalizeApplicationSettings(app.data, routes).previewRouting,
  );
  const routing: PreviewRouting =
    state.routingDraft ??
    (savedRouting.success ? savedRouting.data : { mode: "inherit" });
  const savePreview = useSaveApplicationPreview();
  const createPreview = useApprovePreview();
  const failure = savePreview.error ?? createPreview.error;
  const error = failure ? describeError(failure) : "";
  const saved = savePreview.isSuccess;
  const busy = savePreview.isPending;
  const previews =
    q.data?.filter(
      (resource) =>
        resource.kind === "application" && resource.data.previewOf === app.id,
    ) ?? [];
  function setRouting(value: PreviewRouting) {
    dispatch({ type: "routing_changed", value });
  }
  function setEnabled(value: boolean) {
    dispatch({ type: "enabled_changed", value });
  }
  function setDomain(value: string) {
    dispatch({ type: "domain_changed", value });
  }
  function setZone(value: string) {
    dispatch({ type: "zone_changed", value });
  }
  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    savePreview.reset();
    createPreview.reset();
    const preview = previewFormSchema.safeParse({
      enabled: state.enabled && routing.mode !== "private",
      domain: state.domain,
      zone: state.zone,
    });
    if (!preview.success) {
      toastValidationError(preview.error);
      return;
    }
    const nextRouting = previewApplicationRoutingSchema(
      routes.some((route) => route.data.protocol !== "tcp"),
    ).safeParse({ enabled: state.enabled, routing });
    if (!nextRouting.success) {
      toastValidationError(nextRouting.error);
      return;
    }
    savePreview.mutate(
      {
        id: app.id,
        payload: {
          kind: app.kind,
          name: app.name,
          version: app.version,
          data: {
            ...normalizeApplicationSettings(app.data, routes),
            previewRouting: nextRouting.data.routing,
            previews: state.enabled,
            previewDomain: preview.data.domain,
            previewZoneId: preview.data.zone,
          },
        },
      },
      { onSuccess: () => changes.saved() },
    );
  }
  function approvePreview(preview: Resource) {
    if (createPreview.isPending && createPreview.variables?.id === preview.id)
      return;
    const parsed = previewCommitSchema.safeParse({
      sha: preview.data.previewSha,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    createPreview.mutate({ id: preview.id, sha: parsed.data.sha });
  }
  return {
    state,
    derived: {
      q,
      routes,
      routing,
      error,
      saved,
      busy,
      previews,
      createPreview,
    },
    handlers: {
      setRouting,
      setEnabled,
      setDomain,
      setZone,
      saveSettings,
      approvePreview,
    },
  };
}
