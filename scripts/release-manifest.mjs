import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
function hash(b) {
  return createHash("sha256").update(b).digest("hex");
}
const version = (await readFile("VERSION", "utf8")).trim();
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
  throw Error("Invalid VERSION");
function env(k) {
  if (!process.env[k]) throw Error(`Missing ${k}`);
  return process.env[k];
}
function image(key, repository) {
  const digest = env(key);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest))
    throw Error("Invalid image digest");
  return `${repository}@${digest}`;
}
await mkdir(".local/release", { recursive: true });
const migrations = [];
for (const name of (await readdir("internal/db/migrations"))
  .filter((n) => n.endsWith(".sql") && !n.endsWith(".down.sql"))
  .sort()) {
  const base = name.slice(0, -4),
    meta = JSON.parse(
      await readFile(`internal/db/migrations/${base}.json`, "utf8"),
    );
  async function text(p) {
    return (await readFile(p, "utf8")).replace(/\r\n/g, "\n");
  }
  migrations.push({
    ...meta,
    version: Number(base.split("_")[0]),
    upChecksum: hash(await text(`internal/db/migrations/${name}`)),
    downChecksum: hash(await text(`internal/db/migrations/${base}.down.sql`)),
  });
}
const assets = {};
for (const name of ["install.sh", "compose.host.yaml"]) {
  let content = await readFile(name, "utf8");
  content = content.replace(/\r\n/g, "\n");
  if (name === "compose.host.yaml") {
    const pg = env("POSTGRES_IMAGE");
    if (!/^postgres@sha256:[a-f0-9]{64}$/.test(pg))
      throw Error("Invalid PostgreSQL digest");
    content = content.replace("image: postgres:18-alpine", `image: ${pg}`);
  }
  await writeFile(`.local/release/${name}`, content);
  assets[name] = hash(content);
}
const manifest = {
  format: 1,
  version,
  commit: env("SOURCE_COMMIT"),
  builtAt: env("BUILD_DATE"),
  previous: process.env.PREVIOUS_VERSION || "",
  coreImage: image("CORE_DIGEST", "ghcr.io/amirhmzz/shipyard"),
  executorImage: image("EXECUTOR_DIGEST", "ghcr.io/amirhmzz/shipyard-executor"),
  architectures: ["amd64", "arm64"],
  schema: migrations.length,
  updaterProtocol: 1,
  postgresMajor: 18,
  minimumDocker: 27,
  minimumCompose: "2.24.0",
  migrations,
  assets,
};
if (manifest.previous) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.previous))
    throw Error("Invalid predecessor");
  const a = version.split(".").map(BigInt),
    b = manifest.previous.split(".").map(BigInt);
  const diff = a.findIndex((n, i) => n !== b[i]);
  if (diff < 0 || a[diff] < b[diff])
    throw Error(
      "Normal releases must advance beyond the preceding published version",
    );
}
if (
  !/^[a-f0-9]{40}$/.test(manifest.commit) ||
  !Number.isFinite(Date.parse(manifest.builtAt))
)
  throw Error("Invalid release build identity");
const raw = JSON.stringify(manifest, null, 2) + "\n";
await writeFile(".local/release/release.json", raw);
await writeFile(
  ".local/release/SHA256SUMS",
  [
    ...Object.entries(assets).map(([name, sum]) => `${sum}  ${name}`),
    `${hash(raw)}  release.json`,
  ].join("\n") + "\n",
);
