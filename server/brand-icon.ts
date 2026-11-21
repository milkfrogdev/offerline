import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface CachedBrandIcon {
  contentType: string;
  body: Buffer;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 240;
const POSITIVE_TTL_MS = 24 * 3600_000;
const NEGATIVE_TTL_MS = 30 * 60_000;
const MAX_ICON_BYTES = 256 * 1024;
const MAX_HTML_BYTES = 256 * 1024;

const iconCache = new Map<string, CachedBrandIcon | null & { expiresAt: number }>();
const negCache = new Map<string, number>();

export function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true; // Link-local
    }
    if (lower.startsWith("::ffff:")) {
      return isPrivateOrReservedIp(lower.slice(7));
    }
    return false;
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (isIP(host)) {
    return !isPrivateOrReservedIp(host);
  }
  try {
    const addrs = await lookup(host, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => !isPrivateOrReservedIp(a.address));
  } catch {
    return false;
  }
}

export function extractCandidateOrigins(rawUrl: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return [];
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return [];
  const host = parsed.hostname.toLowerCase();
  const origins = [`https://${host}`];
  const parts = host.split(".");
  if (parts.length >= 3) {
    const isMultiTld =
      parts.length >= 4 &&
      ["com", "net", "org", "edu", "gov", "co"].includes(parts[parts.length - 2]) &&
      parts[parts.length - 1].length === 2;
    const rootDomain = isMultiTld ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
    if (rootDomain !== host) {
      origins.push(`https://www.${rootDomain}`);
      origins.push(`https://${rootDomain}`);
    }
  }
  return [...new Set(origins)];
}

async function safeFetch(
  targetUrl: string,
  maxBytes: number,
  timeoutMs = 5000,
): Promise<{ body: Buffer; contentType: string; finalUrl: string } | null> {
  let current = targetUrl;
  for (let hop = 0; hop < 3; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!(await assertPublicHost(parsed.hostname))) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OfferLineIconFetcher/1.0)",
          Accept: "image/svg+xml,image/png,image/webp,image/x-icon,image/*,text/html;q=0.8",
        },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("location");
        if (!loc) return null;
        current = new URL(loc, current).toString();
        continue;
      }
      if (!resp.ok) return null;
      const contentType = (resp.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const chunks: Buffer[] = [];
      let total = 0;
      const reader = resp.body?.getReader();
      if (!reader) return null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }
      return { body: Buffer.concat(chunks), contentType, finalUrl: current };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function sanitizeSvgBuffer(buf: Buffer): Buffer | null {
  const raw = buf.toString("utf8");
  if (!/<svg\b/i.test(raw) || !/<\/svg>/i.test(raw)) return null;
  const cleaned = raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
  return Buffer.from(cleaned, "utf8");
}

function detectValidImage(body: Buffer, contentType: string, url: string): { contentType: string; body: Buffer } | null {
  if (body.length < 40) return null;
  // PNG
  if (body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) {
    return { contentType: "image/png", body };
  }
  // JPEG
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return { contentType: "image/jpeg", body };
  }
  // WEBP
  if (body.length > 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") {
    return { contentType: "image/webp", body };
  }
  // ICO
  if (body[0] === 0x00 && body[1] === 0x00 && (body[2] === 0x01 || body[2] === 0x02) && body[3] === 0x00) {
    return { contentType: "image/x-icon", body };
  }
  // SVG
  const head = body.subarray(0, 260).toString("utf8").trimStart().toLowerCase();
  if (contentType === "image/svg+xml" || url.toLowerCase().endsWith(".svg") || head.startsWith("<svg") || head.includes("<svg")) {
    const clean = sanitizeSvgBuffer(body);
    if (clean) return { contentType: "image/svg+xml", body: clean };
  }
  return null;
}

function parseIconLinksFromHtml(html: string, baseUrl: string): string[] {
  const found: { prio: number; url: string }[] = [];
  const matches = html.matchAll(/<link\b[^>]*>/gi);
  for (const m of matches) {
    const tag = m[0];
    const relM = tag.match(/rel=["']([^"']+)["']/i);
    const hrefM = tag.match(/href=["']([^"']+)["']/i);
    if (!relM || !hrefM) continue;
    const rel = relM[1].toLowerCase();
    if (!rel.includes("icon")) continue;
    const href = hrefM[1].trim();
    if (!href || href.startsWith("data:")) continue;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    let prio = 20;
    if (abs.toLowerCase().endsWith(".svg")) prio = 95;
    else if (rel.includes("apple-touch-icon")) prio = 85;
    else if (abs.toLowerCase().includes(".png")) prio = 65;
    const sizeM = tag.match(/sizes=["'](\d+)/i);
    if (sizeM) prio += Math.min(30, Math.floor(Number(sizeM[1]) / 8));
    found.push({ prio, url: abs });
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => b.prio - a.prio)
    .map((x) => x.url)
    .filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    })
    .slice(0, 5);
}

function putCache(key: string, value: CachedBrandIcon) {
  if (iconCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = iconCache.keys().next().value;
    if (oldest) iconCache.delete(oldest);
  }
  iconCache.set(key, value);
}

export async function resolveSiteBrandIcon(
  rawUrl: string,
): Promise<{ contentType: string; body: Buffer } | null> {
  const origins = extractCandidateOrigins(rawUrl);
  if (!origins.length) return null;

  const cacheKey = origins[0];
  const now = Date.now();
  const cached = iconCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { contentType: cached.contentType, body: cached.body };
  }
  const negUntil = negCache.get(cacheKey);
  if (negUntil && negUntil > now) {
    return null;
  }

  for (const origin of origins) {
    const iconUrls: string[] = [];
    const htmlResp = await safeFetch(origin, MAX_HTML_BYTES, 4000);
    if (htmlResp && htmlResp.contentType.includes("html")) {
      iconUrls.push(...parseIconLinksFromHtml(htmlResp.body.toString("utf8"), htmlResp.finalUrl));
    }
    iconUrls.push(`${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`);

    const tried = new Set<string>();
    for (const u of iconUrls) {
      if (tried.has(u)) continue;
      tried.add(u);
      const res = await safeFetch(u, MAX_ICON_BYTES, 4000);
      if (!res) continue;
      const valid = detectValidImage(res.body, res.contentType, u);
      if (valid) {
        putCache(cacheKey, { ...valid, expiresAt: now + POSITIVE_TTL_MS });
        return valid;
      }
    }
  }

  negCache.set(cacheKey, now + NEGATIVE_TTL_MS);
  return null;
}
