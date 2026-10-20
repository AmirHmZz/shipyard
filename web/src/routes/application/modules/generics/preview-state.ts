import type { Resource } from "@/lib/api/types";
import type { PreviewRouting } from "@/lib/application-settings";

import { text } from "@/lib/resource-fields";

export type PreviewState = {
  routingDraft: PreviewRouting | null;
  enabled: boolean;
  domain: string;
  zone: string;
};
export type PreviewAction =
  | { type: "routing_changed"; value: PreviewRouting }
  | { type: "enabled_changed"; value: boolean }
  | { type: "domain_changed"; value: string }
  | { type: "zone_changed"; value: string };
export function initialPreviewState(app: Resource): PreviewState {
  return {
    routingDraft: null,
    enabled: !!app.data.previews,
    domain: text(app.data, "previewDomain"),
    zone: text(app.data, "previewZoneId"),
  };
}
export function previewReducer(
  state: PreviewState,
  action: PreviewAction,
): PreviewState {
  switch (action.type) {
    case "routing_changed":
      return { ...state, routingDraft: action.value };
    case "enabled_changed":
      return { ...state, enabled: action.value };
    case "domain_changed":
      return { ...state, domain: action.value };
    case "zone_changed":
      return { ...state, zone: action.value };
  }
}
