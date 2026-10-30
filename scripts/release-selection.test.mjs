import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assessReleaseState,
  parseReleaseSubject,
  parseReleaseTag,
  validateReleaseMetadata,
} from "./release-selection.mjs";

test("only an exact release commit subject selects a release", () => {
  assert.deepEqual(parseReleaseSubject("chore(main): release 0.8.0"), {
    version: "0.8.0",
    tag: "v0.8.0",
  });
  for (const subject of [
    "feat: ordinary change",
    "chore(main): release v0.8.0",
    "chore(main): release 01.2.3",
    "chore(main): release 0.8",
    "chore(main): release 0.8.0 ",
  ])
    assert.equal(parseReleaseSubject(subject), null);
  assert.throws(() => parseReleaseTag("0.8.0"), /Invalid release tag/);
});

test("selected versions require synchronized product metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "shipyard-release-selection-"));
  try {
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "VERSION"), "1.2.3\n");
    writeFileSync(join(root, "web/package.json"), '{"version":"1.2.3"}\n');
    writeFileSync(join(root, "CHANGELOG.md"), "## [1.2.3] - current\n");
    const selection = { version: "1.2.3", tag: "v1.2.3" };
    assert.deepEqual(validateReleaseMetadata(root, selection), selection);

    writeFileSync(join(root, "web/package.json"), '{"version":"1.2.4"}\n');
    assert.throws(
      () => validateReleaseMetadata(root, selection),
      /web\/package.json/,
    );
    writeFileSync(join(root, "web/package.json"), '{"version":"1.2.3"}\n');
    writeFileSync(join(root, "CHANGELOG.md"), "## [1.2.2] - old\n");
    assert.throws(
      () => validateReleaseMetadata(root, selection),
      /missing a 1.2.3 heading/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release state permits retries and replacements but refuses unrelated releases", () => {
  const expectedCommit = "a".repeat(40),
    tag = "v1.2.3";
  assert.deepEqual(assessReleaseState({ expectedCommit }), {
    createTag: true,
    createRelease: true,
  });
  assert.deepEqual(
    assessReleaseState({
      expectedCommit,
      expectedTag: tag,
      tagCommit: expectedCommit,
      release: {
        tagName: tag,
        isDraft: true,
        isPrerelease: false,
      },
    }),
    { createTag: false, createRelease: false },
  );
  assert.deepEqual(
    assessReleaseState({
      expectedCommit,
      expectedTag: tag,
      tagCommit: "b".repeat(40),
    }),
    { createTag: false, createRelease: true },
  );
  assert.deepEqual(
    assessReleaseState({
      expectedCommit,
      expectedTag: tag,
      release: {
        tagName: tag,
        isDraft: false,
        isPrerelease: false,
      },
    }),
    { createTag: true, createRelease: false },
  );
  assert.throws(
    () =>
      assessReleaseState({
        expectedCommit,
        expectedTag: tag,
        release: {
          tagName: tag,
          isDraft: true,
          isPrerelease: true,
        },
      }),
    /Prerelease/,
  );
  assert.throws(
    () =>
      assessReleaseState({
        expectedCommit,
        expectedTag: tag,
        release: {
          tagName: "v1.2.4",
          isDraft: true,
          isPrerelease: false,
        },
      }),
    /unexpected tag/,
  );
});
