import { expect, it } from "vitest";

import { initialResourceFormState, resourceFormReducer } from "./state";

it("clears project-dependent environment selection and Git-dependent source fields atomically", () => {
  const initial = initialResourceFormState({
    kind: "application",
    resources: [],
  });
  const git = resourceFormReducer(initial, {
    type: "data_changed",
    value: { gitId: "git", repository: "owner/repo", branch: "main" },
  });
  expect(
    resourceFormReducer(git, {
      type: "data_field_changed",
      key: "gitId",
      value: "other",
    }).data,
  ).toMatchObject({ gitId: "other", repository: "", branch: "" });
  expect(
    resourceFormReducer(git, {
      type: "data_field_changed",
      key: "repository",
      value: "owner/other",
    }).data,
  ).toMatchObject({ repository: "owner/other", branch: "" });
  expect(
    resourceFormReducer(
      { ...git, parent: "env" },
      { type: "project_changed", value: "project" },
    ),
  ).toMatchObject({ project: "project", parent: "" });
  expect(git.data.branch).toBe("main");
});
it("switches to Compose with the same dependent settings reset and preserves the edit revision", () => {
  const initial = {
    ...initialResourceFormState({ kind: "application", resources: [] }),
    version: 7,
  };
  const compose = resourceFormReducer(initial, {
    type: "data_field_changed",
    key: "source",
    value: "compose",
  });
  expect(compose.data).toMatchObject({
    source: "compose",
    engine: "compose",
    gitId: "",
    repository: "",
    branch: "",
    file: "compose.yaml",
    autoDeploy: false,
    previews: false,
  });
  expect(
    resourceFormReducer(compose, { type: "name_changed", value: "Edited" })
      .version,
  ).toBe(7);
});
it("discards credentials when SSH authentication changes and discards discovered domain data when its provider changes", () => {
  const server = initialResourceFormState({ kind: "server", resources: [] });
  const secret = resourceFormReducer(server, {
    type: "secret_changed",
    key: "password",
    value: "test-secret",
  });
  expect(
    resourceFormReducer(secret, {
      type: "data_field_changed",
      key: "authMethod",
      value: "private_key",
    }).secrets,
  ).toEqual({});
  const zone = {
    ...initialResourceFormState({ kind: "zone", resources: [] }),
    data: { domain: "example.test" },
  };
  expect(
    resourceFormReducer(zone, { type: "parent_changed", value: "provider" })
      .data,
  ).toEqual({});
});
