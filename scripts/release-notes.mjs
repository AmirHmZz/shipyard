import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseReleaseTag } from "./release-selection.mjs";

export function extractReleaseNotes(changelog, version) {
  parseReleaseTag(`v${version}`);
  const lines = changelog.replaceAll("\r\n", "\n").split("\n");
  const headings = [];
  for (const [index, line] of lines.entries()) {
    const match =
      /^## (?:\[([^\]]+)\](?:\([^)]*\))?|([0-9]+\.[0-9]+\.[0-9]+))(?:\s.*)?$/.exec(
        line,
      );
    if ((match?.[1] ?? match?.[2]) === version) headings.push(index);
  }
  if (headings.length !== 1)
    throw new Error(
      `Expected one CHANGELOG.md heading for ${version}, found ${headings.length}`,
    );
  const start = headings[0] + 1;
  let end = lines.findIndex(
    (line, index) => index >= start && /^##\s/.test(line),
  );
  if (end === -1) end = lines.length;
  const notes = lines.slice(start, end).join("\n").trim();
  const hasChanges = notes.split("\n").some((line) => {
    if (!/^\s*[-*]\s+/.test(line)) return false;
    const description = line
      .replace(/\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\b(?:full changelog|changelog|compare|github)\b/gi, "");
    return /[a-z]/i.test(description);
  });
  if (!hasChanges)
    throw new Error(
      `CHANGELOG.md ${version} must describe changes, not just link to GitHub`,
    );
  return notes + "\n";
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { version } = parseReleaseTag(argument("tag"));
  const root = resolve(argument("source") ?? ".");
  process.stdout.write(
    extractReleaseNotes(
      readFileSync(resolve(root, "CHANGELOG.md"), "utf8"),
      version,
    ),
  );
}
