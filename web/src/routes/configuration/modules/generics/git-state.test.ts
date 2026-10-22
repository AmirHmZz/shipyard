import { expect, it } from "vitest";

import { initialGitConnectionState, gitConnectionReducer } from "./git-state";

it("discards the instance credential draft atomically when switching providers", () => {
  const initial = initialGitConnectionState();
  const draft = gitConnectionReducer(initial, {
    type: "instance_form_changed",
    value: {
      id: "",
      name: "Instance",
      url: "https://git.test",
      clientId: "client",
      clientSecret: "test-secret",
    },
  });
  expect(
    gitConnectionReducer(draft, { type: "provider_changed", value: "gitea" }),
  ).toEqual({ ...initial, provider: "gitea" });
  expect(draft.instanceForm?.clientSecret).toBe("test-secret");
  expect(
    gitConnectionReducer(initial, {
      type: "field_changed",
      field: "instanceId",
      value: "instance",
    }).instanceId,
  ).toBe("instance");
});
