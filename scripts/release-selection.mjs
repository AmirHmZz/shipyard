import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)";
const TAG_RE = new RegExp(`^v${VERSION_PATTERN}$`);
const SUBJECT_RE = new RegExp(
  `^chore\\(main\\): release (${VERSION_PATTERN})$`,
);

export function parseReleaseSubject(subject) {
  const match = SUBJECT_RE.exec(subject);
  return match ? { version: match[1], tag: `v${match[1]}` } : null;
}

export function parseReleaseTag(tag) {
  if (!TAG_RE.test(tag)) throw new Error(`Invalid release tag: ${tag}`);
  return { version: tag.slice(1), tag };
}

export function validateReleaseMetadata(root, selection) {
  const version = readFileSync(resolve(root, "VERSION"), "utf8").trim();
  const packageVersion = JSON.parse(
    readFileSync(resolve(root, "web/package.json"), "utf8"),
  ).version;
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");

  if (version !== selection.version)
    throw new Error(`VERSION is ${version}, expected ${selection.version}`);
  if (packageVersion !== selection.version)
    throw new Error(
      `web/package.json is ${packageVersion}, expected ${selection.version}`,
    );
  if (
    !changelog
      .split(/\r?\n/)
      .some((line) => line.startsWith(`## [${selection.version}]`))
  )
    throw new Error(`CHANGELOG.md is missing a ${selection.version} heading`);
  return selection;
}

export function assessReleaseState({
  expectedCommit,
  expectedTag,
  tagCommit = null,
  release = null,
}) {
  if (tagCommit && tagCommit !== expectedCommit)
    throw new Error(
      `Release tag targets ${tagCommit}, expected ${expectedCommit}`,
    );
  if (release?.tagName && release.tagName !== expectedTag)
    throw new Error(`Release is attached to unexpected tag ${release.tagName}`);
  if (release?.isPrerelease)
    throw new Error("Prerelease drafts cannot be reused");
  if (release && !release.isDraft)
    throw new Error("Published releases cannot be overwritten");
  return { createTag: tagCommit === null, createRelease: release === null };
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = argument("mode");
  if (mode === "state") {
    const rawRelease = argument("release"),
      parsedRelease = rawRelease ? JSON.parse(rawRelease) : null;
    const result = assessReleaseState({
      expectedCommit: argument("expected-commit"),
      expectedTag: argument("expected-tag"),
      tagCommit: argument("tag-commit") || null,
      release: parsedRelease
        ? {
            tagName: parsedRelease.tag_name ?? parsedRelease.tagName,
            isDraft: parsedRelease.draft ?? parsedRelease.isDraft,
            isPrerelease:
              parsedRelease.prerelease ?? parsedRelease.isPrerelease,
          }
        : null,
    });
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }

  const source = argument("source");
  if (!source) throw new Error("--source is required");

  let selection;
  if (mode === "automatic") {
    selection = parseReleaseSubject(argument("subject") ?? "");
    if (!selection) {
      process.stdout.write(JSON.stringify({ release: false }));
      process.exit(0);
    }
  } else if (mode === "manual") {
    selection = parseReleaseTag(argument("tag") ?? "");
  } else {
    throw new Error(`Invalid release selection mode: ${mode}`);
  }

  validateReleaseMetadata(source, selection);
  process.stdout.write(JSON.stringify({ release: true, ...selection }));
}
