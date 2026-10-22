import * as z from "zod/mini";

import fixtures from "../../../api/testdata/contracts.json";

const fixtureSchema = z.array(
  z.object({ name: z.string(), schema: z.string(), body: z.unknown() }),
);

export function contractFixtures(schema: string) {
  return fixtureSchema
    .parse(fixtures)
    .filter((fixture) => fixture.schema === schema);
}
