import { type Env } from "./telegram";
import { LABEL, EMOJI } from "./labels";
import { type AlertEvent, type DeliverResult } from "./channels";

// Web Push (RFC 8030/8188/8291 + VAPID RFC 8292), implemented with Web Crypto.
// aes128gcm content encoding; one record per message.

const enc = new TextEncoder();

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(u8: Uint8Array): string {
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

/** VAPID Authorization header: a signed ES256 JWT plus the public key. */
async function vapidAuth(env: Env, endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = bytesToB64url(enc.encode(JSON.stringify({ aud, exp, sub: env.VAPID_SUBJECT })));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(env.VAPID_JWK),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)));
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${env.VAPID_PUBLIC}`;
}

/** Encrypt a payload to a subscription's key material (aes128gcm, one record). */
async function encryptPayload(payload: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<Uint8Array> {
  const eph = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", eph.publicKey)) as ArrayBuffer); // 65 bytes
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // `public` is the runtime property; cast past the workers-types alias quirk.
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as any, eph.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(payload, new Uint8Array([2])); // single-record delimiter 0x02
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  // header: salt(16) | rs:uint32(4096) | idlen:uint8(65) | keyid(as_public 65) | ciphertext
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

function notification(event: AlertEvent): Uint8Array {
  const title = event.level === "operational"
    ? `${EMOJI[event.level]} ${event.name} recovered`
    : `${EMOJI[event.level]} ${event.name}: ${LABEL[event.level]}`;
  const body = event.incident || `Status is now ${LABEL[event.level]}.`;
  return enc.encode(JSON.stringify({ title, body, url: event.url, tag: `oo-${event.id}` }));
}

export async function sendWebPush(
  env: Env,
  target: { channel: string; address: string; meta: string | null },
  event: AlertEvent,
): Promise<DeliverResult> {
  if (!env.VAPID_JWK || !env.VAPID_PUBLIC) {
    console.warn("VAPID keys not configured");
    return "retry";
  }
  let meta: { p256dh?: string; auth?: string };
  try { meta = JSON.parse(target.meta ?? "{}"); } catch { return "gone"; }
  if (!meta.p256dh || !meta.auth) return "gone";

  const body = await encryptPayload(notification(event), b64urlToBytes(meta.p256dh), b64urlToBytes(meta.auth));
  const res = await fetch(target.address, {
    method: "POST",
    headers: {
      authorization: await vapidAuth(env, target.address),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
    },
    body,
  });
  await res.body?.cancel().catch(() => {});
  if (res.status === 200 || res.status === 201) return "ok";
  if (res.status === 404 || res.status === 410) return "gone";   // subscription expired
  if (res.status === 429 || res.status >= 500) return "retry";
  console.warn("web push rejected", { status: res.status });
  return "gone";
}
