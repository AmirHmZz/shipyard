import { expect, it } from "vitest";

import { initialRepairState, repairReducer } from "./repair-state";

it("clears the credential when authentication changes and after a save", () => {
  const initial = {
    host: "server.test",
    port: "22",
    user: "root",
    fingerprint: "fingerprint",
    auth: "private_key",
    credential: "",
  };
  const typed = repairReducer(initial, {
    type: "field_changed",
    field: "credential",
    value: "test-credential",
  });
  const password = repairReducer(typed, {
    type: "auth_changed",
    value: "password",
  });
  expect(password).toEqual({ ...initial, auth: "password" });
  expect(repairReducer(typed, { type: "saved" })).toEqual(initial);
  expect(typed.credential).toBe("test-credential");
  expect(
    repairReducer(initial, {
      type: "field_changed",
      field: "port",
      value: "2222",
    }).port,
  ).toBe("2222");
});
it("initializes from saved connection values without copying a stored credential", () => {
  expect(
    initialRepairState({
      id: "server",
      kind: "server",
      name: "Server",
      parentId: "",
      teamId: "",
      data: {
        host: "server.test",
        user: "deploy",
        fingerprint: "verified",
        password: "never-copy",
      },
      variables: {},
      secretKeys: ["password"],
      canWrite: true,
      version: 1,
      createdAt: "",
      updatedAt: "",
    }),
  ).toEqual({
    host: "server.test",
    port: "22",
    user: "deploy",
    fingerprint: "verified",
    auth: "private_key",
    credential: "",
  });
});
