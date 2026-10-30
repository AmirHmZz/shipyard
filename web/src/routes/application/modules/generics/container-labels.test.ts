import { expect, it } from "vitest";

import { containerOptions } from "./container-labels";

it("uses service names, distinguishes replicas and retains full ID values", () => {
  expect(
    containerOptions(
      ["a", "b", "c"],
      [
        { id: "a", service: "web", replica: 1, name: "project-web-1" },
        { id: "b", service: "web", replica: 2, name: "project-web-2" },
        { id: "c", service: "db", replica: 1, name: "project-db-1" },
        { id: "unrelated", service: "db", replica: 2, name: "other-db" },
      ],
    ),
  ).toEqual([
    { id: "a", label: "web (1)" },
    { id: "b", label: "web (2)" },
    { id: "c", label: "db" },
  ]);
});

it("falls back to container name and then shortened ID", () => {
  expect(
    containerOptions(
      ["known", "01234567890123456789"],
      [{ id: "known", service: "", replica: 0, name: "friendly-name" }],
    ),
  ).toEqual([
    { id: "known", label: "friendly-name" },
    { id: "01234567890123456789", label: "012345678901" },
  ]);
});
