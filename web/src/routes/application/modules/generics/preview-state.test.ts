import { expect, it } from "vitest";

import { previewReducer } from "./preview-state";

it("retains wildcard and zone drafts while toggling previews and private routing", () => {
  const original = {
    routingDraft: null,
    enabled: true,
    domain: "*.preview.example.test",
    zone: "zone",
  };
  const privateState = previewReducer(original, {
    type: "routing_changed",
    value: { mode: "private" },
  });
  const disabled = previewReducer(privateState, {
    type: "enabled_changed",
    value: false,
  });
  expect(disabled).toMatchObject({
    domain: original.domain,
    zone: "zone",
    enabled: false,
    routingDraft: { mode: "private" },
  });
  expect(
    previewReducer(disabled, { type: "domain_changed", value: "*.new.test" })
      .domain,
  ).toBe("*.new.test");
  expect(
    previewReducer(disabled, { type: "zone_changed", value: "other" }).zone,
  ).toBe("other");
  expect(original.routingDraft).toBeNull();
});
