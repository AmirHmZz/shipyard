import { expect, it } from "vitest";

import { initialNetworkFormState, networkFormReducer } from "./network-state";

it("initializes registration from URL parameters and clears only the selected network when switching servers", () => {
  const initial = initialNetworkFormState(
    new URLSearchParams({
      server: "one",
      dockerId: "docker",
      name: "External",
    }),
  );
  expect(initial).toMatchObject({
    mode: "existing",
    server: "one",
    selected: "docker",
    name: "External",
  });
  expect(
    networkFormReducer(initial, { type: "server_changed", value: "two" }),
  ).toMatchObject({
    mode: "existing",
    server: "two",
    selected: "",
    name: "External",
  });
  expect(initial.selected).toBe("docker");
});
it("keeps draft subnets while toggling IPv6 and changing source modes", () => {
  const initial = initialNetworkFormState(new URLSearchParams());
  const draft = networkFormReducer(initial, {
    type: "field_changed",
    field: "subnet6",
    value: "fd00::/64",
  });
  const enabled = networkFormReducer(draft, {
    type: "ipv6_changed",
    value: true,
  });
  expect(
    networkFormReducer(enabled, {
      type: "field_changed",
      field: "mode",
      value: "existing",
    }),
  ).toMatchObject({ mode: "existing", subnet6: "fd00::/64", v6: true });
});
