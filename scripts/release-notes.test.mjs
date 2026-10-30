import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { extractReleaseNotes } from "./release-notes.mjs";

test("extracts only the selected release and preserves Markdown", () => {
  const changelog =
    "# Changelog\r\n\r\n## [1.2.3](https://example.test/compare) (2026-10-30)\r\n\r\n### Features\r\n\r\n- Upload **logos**.\r\n\r\n### Upgrade Notes\r\n\r\n- Apply migration 9.\r\n\r\n## [1.2.2] (2026-10-29)\r\n\r\n- Older changes.\r\n";
  assert.equal(
    extractReleaseNotes(changelog, "1.2.3"),
    "### Features\n\n- Upload **logos**.\n\n### Upgrade Notes\n\n- Apply migration 9.\n",
  );
  assert.equal(
    extractReleaseNotes(
      "## 0.1.0 (2026-10-17)\n\n- Initial deployment platform.\n",
      "0.1.0",
    ),
    "- Initial deployment platform.\n",
  );
});

test("refuses missing, duplicate, empty and link-only release notes", () => {
  for (const changelog of [
    "## [1.2.2]\n- Other release.\n",
    "## [1.2.3]\n- First.\n## [1.2.3]\n- Duplicate.\n",
    "## [1.2.3]\n",
    "## [1.2.3]\n**Full Changelog**: https://github.com/example/project/compare/v1.2.2...v1.2.3\n",
    "## [1.2.3]\n- [Full Changelog](https://github.com/example/project/compare/v1.2.2...v1.2.3)\n",
  ])
    assert.throws(() => extractReleaseNotes(changelog, "1.2.3"));
  assert.throws(
    () => extractReleaseNotes("", "../1.2.3"),
    /Invalid release tag/,
  );
});

test("every historical release describes its changes", () => {
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  for (let minor = 1; minor <= 12; minor++) {
    const notes = extractReleaseNotes(changelog, `0.${minor}.0`);
    assert.doesNotMatch(
      notes,
      /Release notes are maintained by Release Please|\*\*Full Changelog\*\*/,
    );
  }
});

test("CLI renders the versioned changelog without GitHub API access", () => {
  const version = readFileSync("VERSION", "utf8").trim();
  const actual = execFileSync(
    process.execPath,
    [
      resolve("scripts/release-notes.mjs"),
      "--tag",
      `v${version}`,
      "--source",
      resolve("."),
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    actual,
    extractReleaseNotes(readFileSync("CHANGELOG.md", "utf8"), version),
  );
});
