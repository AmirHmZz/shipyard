import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
function value(key, fallback = "") {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : fallback;
}
const origin = value("--origin", "http://localhost:8080");
const email = value("--acme-email");
const accept = args.includes("--accept-acme-tos");
if (args.includes("--local-host"))
  throw new Error(
    "Use the published install.sh for native Linux installation.",
  );
const parsed = new URL(origin);
if (
  !["http:", "https:"].includes(parsed.protocol) ||
  parsed.username ||
  parsed.pathname !== "/" ||
  parsed.search ||
  parsed.hash
)
  throw new Error(
    "Origin must be an HTTP(S) origin without a path or credentials",
  );
const contents = `POSTGRES_PASSWORD=${randomBytes(32).toString("hex")}\nSHIPYARD_MASTER_KEY=${randomBytes(32).toString("base64")}\nSHIPYARD_BOOTSTRAP_TOKEN=${randomBytes(32).toString("hex")}\nSHIPYARD_ORIGIN=${origin.replace(/\/$/, "")}\nSHIPYARD_PORT=8080\nSHIPYARD_ACME_EMAIL=${email}\nSHIPYARD_ACME_ACCEPT_TOS=${accept}\n`;
try {
  await writeFile(".env", contents, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Created .env with unique installation keys. Keep this file safe. Existing files are never overwritten.",
  );
} catch (e) {
  if (e.code === "EEXIST") {
    console.log(".env already exists; no keys were changed.");
  } else throw e;
}
