import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

test("release artifacts pin images, preserve migration checksums and refuse invalid versions", () => {
  const root = resolve("."),
    temp = mkdtempSync(join(tmpdir(), "shipyard-release-"));
  try {
    mkdirSync(join(temp, "internal/db"), { recursive: true });
    cpSync(
      join(root, "internal/db/migrations"),
      join(temp, "internal/db/migrations"),
      { recursive: true },
    );
    for (const name of ["VERSION", "install.sh", "compose.host.yaml"])
      cpSync(join(root, name), join(temp, name));
    const env = {
      ...process.env,
      CORE_DIGEST: "sha256:" + "a".repeat(64),
      EXECUTOR_DIGEST: "sha256:" + "b".repeat(64),
      POSTGRES_IMAGE: "postgres@sha256:" + "c".repeat(64),
      SOURCE_COMMIT: "d".repeat(40),
      BUILD_DATE: "2026-10-17T00:00:00Z",
      PREVIOUS_VERSION: "",
    };
    const run = (extra = {}) =>
      execFileSync(
        process.execPath,
        [join(root, "scripts/release-manifest.mjs")],
        { cwd: temp, env: { ...env, ...extra }, stdio: "pipe" },
      );
    run();
    const dir = join(temp, ".local/release"),
      m = JSON.parse(readFileSync(join(dir, "release.json"), "utf8"));
    assert.equal(m.version, readFileSync(join(root, "VERSION"), "utf8").trim());
    assert.deepEqual(m.architectures, ["amd64", "arm64"]);
    assert.match(
      m.coreImage,
      /^ghcr\.io\/amirhmzz\/shipyard@sha256:[a-f0-9]{64}$/,
    );
    const compose = readFileSync(join(dir, "compose.host.yaml"), "utf8");
    assert.doesNotMatch(compose, /^\s+(build|ports):/m);
    assert.doesNotMatch(compose, /BOOTSTRAP_ORIGIN|localhost:8080/);
    assert.match(compose, /image: postgres@sha256:/);
    for (const line of readFileSync(join(dir, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n")) {
      const [sum, name] = line.split("  ");
      assert.equal(
        createHash("sha256")
          .update(readFileSync(join(dir, name)))
          .digest("hex"),
        sum,
      );
    }
    assert.equal(m.schema, m.migrations.length);
    for (const migration of m.migrations) {
      assert.match(migration.upChecksum, /^[a-f0-9]{64}$/);
      assert.ok(migration.up.impact);
      assert.ok(migration.down.impact);
    }
    assert.throws(() => run({ CORE_DIGEST: "latest" }));
    assert.throws(() => run({ PREVIOUS_VERSION: m.version }));
    assert.throws(() => run({ SOURCE_COMMIT: "unknown" }));
    assert.throws(() => run({ PREVIOUS_VERSION: "0.1.0-preview" }));
  } finally {
    if (
      !resolve(temp).startsWith(resolve(tmpdir()) + sep) ||
      !basename(temp).startsWith("shipyard-release-")
    )
      throw Error("Unsafe temporary cleanup path");
    rmSync(temp, { recursive: true, force: true });
  }
});
