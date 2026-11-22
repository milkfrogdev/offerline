import React, { useEffect, useState } from "react";
import { BRAND_DIRECTORY, type BrandEntry } from "../../shared/companies";

export { BRAND_DIRECTORY, type BrandEntry };

const brandAssets = import.meta.glob<string>("../assets/brands/*.{svg,png}", {
  eager: true,
  import: "default",
});

const ASSET_MAP: Record<string, string> = {};
for (const [path, url] of Object.entries(brandAssets)) {
  const m = path.match(/\/([^/]+)\.(svg|png)$/i);
  if (m) {
    const slug = m[1].toLowerCase();
    if (!ASSET_MAP[slug] || m[2].toLowerCase() === "svg") {
      ASSET_MAP[slug] = url;
    }
  }
}

export interface CompanySuggestion {
  name: string;
  url?: string;
  existing: boolean;
}

export function suggestCompanies(
  rawQuery: string,
  existingList: { company: string; url?: string }[],
): CompanySuggestion[] {
  const q = rawQuery.trim().toLowerCase();
  const out: CompanySuggestion[] = [];
  const seen = new Set<string>();

  for (const item of existingList) {
    const key = item.company.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    const brand = BRAND_DIRECTORY.find((b) => b.match.test(item.company));
    const matches =
      !q ||
      key.includes(q) ||
      Boolean(brand?.keywords.some((kw) => kw.includes(q)));
    if (matches) {
      seen.add(key);
      out.push({ name: item.company.trim(), url: item.url, existing: true });
    }
  }

  for (const b of BRAND_DIRECTORY) {
    const key = b.name.toLowerCase();
    if (seen.has(key)) continue;
    const matches =
      !q ||
      key.includes(q) ||
      b.slug.includes(q) ||
      b.keywords.some((kw) => kw.includes(q));
    if (matches) {
      seen.add(key);
      out.push({ name: b.name, existing: false });
    }
  }

  return out.slice(0, 7);
}

function isValidHttpUrl(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function CompanyLogo({
  company,
  url,
  size = "md",
}: {
  company: string;
  url?: string;
  size?: "sm" | "md";
}) {
  const name = company.trim();
  const rule = BRAND_DIRECTORY.find((r) => r.match.test(name));
  const localSrc = rule ? ASSET_MAP[rule.slug] : undefined;
  const validUrl = !localSrc ? isValidHttpUrl(url) : null;
  const remoteSrc = validUrl ? `/api/brand-icon?url=${encodeURIComponent(validUrl)}` : undefined;

  const [remoteFailed, setRemoteFailed] = useState(false);

  useEffect(() => {
    setRemoteFailed(false);
  }, [remoteSrc]);

  if (localSrc) {
    return (
      <span
        className={`company-logo company-logo-${size}${rule?.invertInDark ? " invert-dark" : ""}`}
        aria-hidden="true"
      >
        <img src={localSrc} alt="" className="brand-img" loading="lazy" decoding="async" />
      </span>
    );
  }

  if (remoteSrc && !remoteFailed) {
    return (
      <span className={`company-logo company-logo-${size}`} aria-hidden="true">
        <img
          src={remoteSrc}
          alt=""
          className="brand-img"
          loading="lazy"
          decoding="async"
          onError={() => setRemoteFailed(true)}
        />
      </span>
    );
  }

  const monogram = name.slice(0, 1).toUpperCase() || "O";
  return (
    <span className={`company-logo company-logo-${size} is-monogram`} aria-hidden="true">
      {monogram}
    </span>
  );
}
