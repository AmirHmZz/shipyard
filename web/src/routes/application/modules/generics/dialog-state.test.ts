import { expect, it } from "vitest";

import {
  initialApplicationDialogState,
  applicationDialogReducer,
} from "./dialog-state";

it("keeps application deletion and action confirmation independent", () => {
  const deletion = applicationDialogReducer(initialApplicationDialogState, {
    type: "deletion_changed",
    value: true,
  });
  const confirmation = applicationDialogReducer(deletion, {
    type: "confirmation_changed",
    value: "stop",
  });
  expect(confirmation).toEqual({
    deleting: true,
    confirmAction: "stop",
    deleteDeployment: null,
  });
  expect(
    applicationDialogReducer(confirmation, {
      type: "deployment_changed",
      value: null,
    }).deleting,
  ).toBe(true);
  expect(initialApplicationDialogState.deleting).toBe(false);
});
