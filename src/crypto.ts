import type { EncryptedEnvelope } from "../shared/types";

export const canUseWebCrypto = (): boolean =>
  typeof window !== "undefined" && window.isSecureContext && !!window.crypto?.subtle;

const PBKDF2_ITERATIONS = 310_000;

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

export async function encryptJson(payload: unknown, passphrase: string): Promise<EncryptedEnvelope> {
  if (!canUseWebCrypto()) {
    throw new Error("当前非 HTTPS 安全上下文，浏览器禁用了 WebCrypto 加密。");
  }
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuf = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: toB64Url(salt),
    iv: toB64Url(iv),
    ct: toB64Url(new Uint8Array(cipherBuf)),
  };
}

export async function decryptJson<T>(envelope: EncryptedEnvelope, passphrase: string): Promise<T> {
  if (!canUseWebCrypto()) {
    throw new Error("当前非 HTTPS 安全上下文，无法解密密文。");
  }
  const salt = fromB64Url(envelope.salt);
  const iv = fromB64Url(envelope.iv);
  const ct = fromB64Url(envelope.ct);
  const key = await deriveKey(passphrase, salt, ["decrypt"]);
  try {
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plainBuf)) as T;
  } catch {
    throw new Error("解密失败，请核对加密口令是否正确。");
  }
}
