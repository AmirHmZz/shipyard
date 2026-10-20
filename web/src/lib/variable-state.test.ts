import { expect, it } from "vitest";

import { initialVariableState, variableReducer } from "./variable-state";

it("loads an editing draft atomically and resets fields while retaining its selected scope", () => {
  const editing = variableReducer(initialVariableState, {
    type: "editing_started",
    key: "TOKEN",
    value: "",
    scope: "preview-build:",
    secret: true,
    name: "preview-build:TOKEN",
  });
  expect(editing).toMatchObject({
    key: "TOKEN",
    scope: "preview-build:",
    secret: true,
    editing: "preview-build:TOKEN",
  });
  expect(variableReducer(editing, { type: "reset" })).toEqual({
    ...initialVariableState,
    scope: "preview-build:",
  });
  expect(initialVariableState.key).toBe("");
});
it("clears a removal confirmation without discarding an unrelated editor draft", () => {
  const editing = {
    ...initialVariableState,
    key: "OTHER",
    value: "draft",
    remove: "env:OLD",
  };
  expect(
    variableReducer(editing, { type: "saved", clearEditor: false }),
  ).toEqual({ ...editing, remove: "" });
  expect(
    variableReducer(editing, { type: "saved", clearEditor: true }),
  ).toEqual(initialVariableState);
});
