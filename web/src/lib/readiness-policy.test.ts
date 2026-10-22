import { expect, it } from "vitest";
import * as z from "zod/mini";

import type { Resource } from "@/lib/api/types";

import { initialResourceFormState } from "@/components/resource-forms/state";
import { normalizeApplicationSettings } from "@/lib/application-settings";
import { httpReadinessChecksSchema } from "@/lib/schemas/application";
import { contractFixtures } from "@/test/api-contract-fixtures";

it.each(contractFixtures("ApplicationChecks"))(
  "normalizes saved Go readiness from $name",
  ({ body, name }) => {
    const data = z.record(z.string(), z.unknown()).parse(body);
    const result = normalizeApplicationSettings(data, []);
    expect(result.readinessMode).toBe(
      name === "legacy-application-policy" ? "checks" : "container",
    );
    expect(
      httpReadinessChecksSchema.safeParse(result.readinessChecks).success,
    ).toBe(true);
  },
);

it("defaults new application forms to container readiness and preserves existing policy", () => {
  const state = initialResourceFormState({
    kind: "application",
    resources: [],
  });
  expect(state.data.readinessMode).toBe("container");
  expect(normalizeApplicationSettings({}, []).readinessMode).toBe("checks");
});

it("preserves legacy saved HTTP checks when an incomplete draft is disabled", () => {
  const routes: Resource[] = [
    {
      id: "route",
      kind: "route",
      name: "route",
      teamId: "team",
      parentId: "app",
      data: { targetPort: 8080, service: "worker" },
      variables: {},
      version: 1,
      secretKeys: [],
      canWrite: true,
      createdAt: "",
      updatedAt: "",
    },
  ];
  expect(
    normalizeApplicationSettings(
      {
        readinessMode: "container",
        readinessChecks: [{ service: "", port: 0, path: "" }],
      },
      routes,
      { port: 8080, healthPath: "/ready" },
    ).readinessChecks,
  ).toEqual([{ service: "worker", port: 8080, path: "/ready" }]);
});

it("preserves valid disabled checks and deadlines while ignoring incomplete disabled drafts", () => {
  const saved = {
    readinessChecks: [{ service: "app", port: 8080, path: "/ready" }],
    healthTimeout: 300,
  };
  expect(
    normalizeApplicationSettings({ ...saved, readinessMode: "container" }, []),
  ).toMatchObject(saved);
  expect(
    normalizeApplicationSettings(
      {
        readinessMode: "container",
        readinessChecks: [{ service: "", port: 0, path: "" }],
        healthTimeout: 300,
      },
      [],
      saved,
    ),
  ).toMatchObject(saved);
  expect(
    normalizeApplicationSettings(
      {
        readinessMode: "container",
        readinessChecks: [{ service: "", port: 0, path: "" }],
      },
      [],
    ).readinessChecks,
  ).toEqual([]);
});
