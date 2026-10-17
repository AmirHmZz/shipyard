import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir(".local", { recursive: true });
let privateKey;
try {
  privateKey = createPrivateKey(await readFile(".local/integration_rsa"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await writeFile(
    ".local/integration_rsa",
    privateKey.export({ format: "pem", type: "pkcs1" }),
    { flag: "wx", mode: 0o600 },
  );
}
const jwk = createPublicKey(privateKey).export({ format: "jwk" });
const part = (buffer) => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(buffer.length);
  return Buffer.concat([size, buffer]);
};
const exponent = Buffer.from(jwk.e, "base64url");
let modulus = Buffer.from(jwk.n, "base64url");
if (modulus[0] & 128) modulus = Buffer.concat([Buffer.from([0]), modulus]);
const publicKey =
  "ssh-rsa " +
  Buffer.concat([
    part(Buffer.from("ssh-rsa")),
    part(exponent),
    part(modulus),
  ]).toString("base64");
await writeFile(
  ".local/fixture.env",
  "SHIPYARD_TEST_AUTHORIZED_KEY=" + publicKey + "\n",
  { mode: 0o600 },
);
console.log("Created/reused an ignored, local-only integration fixture key.");
