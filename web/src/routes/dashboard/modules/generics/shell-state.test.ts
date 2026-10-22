import { expect, it } from "vitest";

import { shellReducer } from "./shell-state";

it("changes navigation, search and theme without resetting another open surface", () => {
  const original = {
    search: false,
    mobile: true,
    dark: false,
    collapsed: false,
  };
  const search = shellReducer(original, { type: "search_toggled" });
  expect(shellReducer(search, { type: "theme_toggled" })).toEqual({
    search: true,
    mobile: true,
    dark: true,
    collapsed: false,
  });
  expect(
    shellReducer(search, { type: "mobile_changed", value: false }).search,
  ).toBe(true);
  expect(
    shellReducer(search, { type: "search_changed", value: false }).mobile,
  ).toBe(true);
  expect(original.search).toBe(false);
  expect(shellReducer(search, { type: "sidebar_toggled" })).toEqual({
    ...search,
    collapsed: true,
  });
});
