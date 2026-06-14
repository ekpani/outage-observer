// Generate a VAPID (ECDSA P-256) keypair for Web Push and write three files:
//   /tmp/oo_vapid_public  - base64url raw public key (65 bytes) for clients
//   /tmp/oo_vapid_jwk      - private key JWK (JSON) for signing the VAPID JWT
//   /tmp/oo_vapid_subject  - the contact subject (mailto:)
// Then set them as Worker secrets:
//   cat /tmp/oo_vapid_public  | npx wrangler secret put VAPID_PUBLIC
//   cat /tmp/oo_vapid_jwk     | npx wrangler secret put VAPID_JWK
//   cat /tmp/oo_vapid_subject | npx wrangler secret put VAPID_SUBJECT
import { webcrypto as c } from "node:crypto";
import { writeFileSync } from "node:fs";

const b64url = (u8) =>
  Buffer.from(u8).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const kp = await c.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const rawPub = new Uint8Array(await c.subtle.exportKey("raw", kp.publicKey));
const jwk = await c.subtle.exportKey("jwk", kp.privateKey);

writeFileSync("/tmp/oo_vapid_public", b64url(rawPub));
writeFileSync("/tmp/oo_vapid_jwk", JSON.stringify(jwk));
writeFileSync("/tmp/oo_vapid_subject", "mailto:amrith.shanbhag@gmail.com");
console.log("VAPID public:", b64url(rawPub));
console.log("wrote /tmp/oo_vapid_{public,jwk,subject}");
