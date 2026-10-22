import { expect, it } from "vitest";

import { initialTeamsState, teamsReducer } from "./state";

it("changes invitation scope and its default role atomically without clearing the email", () => {
  const typed = teamsReducer(initialTeamsState, {
    type: "email_changed",
    email: "teammate@example.test",
  });
  const project = teamsReducer(typed, {
    type: "scope_changed",
    value: "project",
  });
  expect(project).toMatchObject({
    project: "project",
    role: "viewer",
    email: typed.email,
  });
  const owner = teamsReducer(project, { type: "role_changed", role: "owner" });
  expect(
    teamsReducer(owner, { type: "scope_changed", value: "team" }),
  ).toMatchObject({ project: "", role: "member", email: typed.email });
  expect(initialTeamsState).toMatchObject({
    email: "",
    project: "",
    role: "member",
  });
});
it("keeps team selection, editor, assignment and removal transitions independent", () => {
  const selected = teamsReducer(initialTeamsState, {
    type: "team_changed",
    teamId: "team",
  });
  const editor = teamsReducer(selected, { type: "editor_changed", open: true });
  const assign = teamsReducer(editor, {
    type: "assignment_changed",
    userId: "member",
  });
  const remove = teamsReducer(assign, {
    type: "removal_changed",
    userId: "other",
  });
  expect(remove).toMatchObject({
    teamId: "team",
    editor: true,
    assign: "member",
    remove: "other",
  });
  expect(
    teamsReducer(remove, { type: "removal_changed", userId: "" }),
  ).toMatchObject({ assign: "member", remove: "", editor: true });
});
