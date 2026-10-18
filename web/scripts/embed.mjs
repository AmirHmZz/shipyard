import { cp, mkdir, readdir, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const root = await realpath(resolve(scripts, "../.."));
const destination = join(root, "internal/web/dist");
await mkdir(destination, { recursive: true });
const actual = await realpath(destination);
if (actual !== destination || !actual.startsWith(root + sep))
  throw new Error(
    "Generated frontend destination must stay inside the repository",
  );
for (const name of await readdir(destination)) {
  if (name !== ".gitkeep")
    await rm(join(destination, name), { recursive: true, force: true });
}
await cp(resolve(scripts, "../build/client"), destination, { recursive: true });
