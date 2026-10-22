import { createConfig, lintFromString } from "@redocly/openapi-core";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../api/openapi.yaml", import.meta.url),
  "utf8",
);
const config = await createConfig({
  rules: { struct: "error", "no-unresolved-refs": "error" },
});
const problems = await lintFromString({ source, config });
for (const problem of problems)
  console.error(
    `${problem.ruleId}: ${problem.message} ${problem.location.map((location) => location.pointer).join(", ")}`,
  );
assert.equal(problems.length, 0, "OpenAPI must be structurally valid");
const document = JSON.parse(source);
const backend = await readFile(
  new URL("../internal/api/api.go", import.meta.url),
  "utf8",
);
const routes = [
  ...backend.matchAll(/r\.(Get|Post|Put|Delete|Patch)\("(\/[^"]+)"/g),
].map((match) => [match[1].toLowerCase(), match[2].replace(/^\/api\/v1/, "")]);
function generic(schema) {
  if (schema?.$ref) {
    const name = schema.$ref.split("/").at(-1);
    return generic(document.components.schemas[name]);
  }
  return (
    (schema?.type === "object" &&
      !schema.properties &&
      schema.additionalProperties === true) ||
    (schema?.type === "array" && generic(schema.items))
  );
}
function resolveSchema(schema) {
  return schema?.$ref
    ? resolveSchema(document.components.schemas[schema.$ref.split("/").at(-1)])
    : schema;
}
for (const [path, operations] of Object.entries(document.paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    assert(
      routes.some(([verb, route]) => verb === method && route === path),
      `Missing backend route: ${method} ${path}`,
    );
    for (const [status, response] of Object.entries(operation.responses)) {
      if (/^2/.test(status))
        assert(
          !generic(response.content?.["application/json"]?.schema),
          `Untyped product response: ${method} ${path} ${status}`,
        );
    }
    if (path !== "/hooks/{id}") {
      const request = resolveSchema(
        operation.requestBody?.content?.["application/json"]?.schema,
      );
      assert(!generic(request), `Untyped product request: ${method} ${path}`);
      if (request?.type === "object")
        assert.equal(
          request.additionalProperties,
          false,
          `Fixed request must reject unknown fields: ${method} ${path}`,
        );
    }
  }
}
for (const [method, path] of routes) {
  if (
    [
      "/healthz",
      "/openapi.yaml",
      "/.well-known/acme-challenge/{token}",
    ].includes(path)
  )
    continue;
  assert(
    document.paths[path]?.[method],
    `Undocumented backend operation: ${method} ${path}`,
  );
}
console.log(
  "OpenAPI structure, backend routes, and product response schemas are consistent.",
);
