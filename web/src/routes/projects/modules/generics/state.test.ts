import { expect, it } from "vitest";

import { initialProjectsState, projectsReducer } from "./state";

it("preserves the filter while opening and closing the resource editor", () => {
  const filtered = projectsReducer(initialProjectsState, {
    type: "filter_changed",
    value: "customer",
  });
  const opened = projectsReducer(filtered, {
    type: "editor_changed",
    request: { kind: "project", parentId: "team" },
  });
  expect(opened).toMatchObject({
    filter: "customer",
    editor: { kind: "project", parentId: "team" },
  });
  expect(
    projectsReducer(opened, { type: "editor_changed", request: null }),
  ).toMatchObject({ editor: null, filter: "customer" });
  expect(
    projectsReducer(opened, { type: "deletion_changed", resource: null })
      .editor,
  ).toEqual(opened.editor);
  expect(initialProjectsState).toEqual({
    deleting: null,
    filter: "",
    editor: null,
  });
});
