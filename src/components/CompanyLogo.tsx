import React, { useEffect, useState } from "react";

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

export interface BrandEntry {
  name: string;
  slug: string;
  keywords: string[];
  match: RegExp;
  invertInDark?: boolean;
}

export const BRAND_DIRECTORY: BrandEntry[] = [
  { name: "腾讯音乐", slug: "tme", keywords: ["tme", "txyy", "qq音乐", "tencent music"], match: /腾讯音乐|tme/i },
  { name: "腾讯云", slug: "tencentcloud", keywords: ["txy", "tencentcloud"], match: /腾讯云/i },
  { name: "腾讯", slug: "tencent", keywords: ["tx", "tencent", "qq", "微信", "wechat"], match: /腾讯|tencent/i },
  { name: "字节跳动", slug: "bytedance", keywords: ["zj", "zjtd", "bytedance", "抖音", "飞书", "tiktok"], match: /字节|bytedance|飞书|抖音|tiktok/i },
  { name: "阿里云", slug: "alibabacloud", keywords: ["aly", "aliyun", "alibabacloud"], match: /阿里云|alibabacloud/i },
  { name: "蚂蚁集团", slug: "ant", keywords: ["my", "ant", "alipay", "支付宝"], match: /蚂蚁|支付宝|ant\s*group|alipay/i },
  { name: "阿里巴巴", slug: "alibaba", keywords: ["al", "ali", "alibaba", "淘宝", "淘天", "天猫"], match: /阿里|淘宝|天猫|淘天|alibaba/i },
  { name: "快手", slug: "kuaishou", keywords: ["ks", "kuaishou"], match: /快手|kuaishou/i },
  { name: "可灵", slug: "kling", keywords: ["kl", "kling"], match: /可灵|kling/i },
  { name: "科大讯飞", slug: "iflytek", keywords: ["kdxf", "xf", "iflytek", "讯飞"], match: /科大讯飞|讯飞|iflytek/i },
  { name: "滴滴", slug: "didi", keywords: ["dd", "didi", "小桔"], match: /滴滴|didi/i },
  { name: "华为", slug: "huawei", keywords: ["hw", "huawei", "海思"], match: /华为|海思|huawei/i },
  { name: "美团", slug: "meituan", keywords: ["mt", "meituan", "大众点评"], match: /美团|大众点评|meituan/i },
  { name: "小红书", slug: "xiaohongshu", keywords: ["xhs", "xiaohongshu", "rednote"], match: /小红书|xiaohongshu|rednote/i },
  { name: "京东", slug: "jd", keywords: ["jd", "jingdong"], match: /京东|jd\.com|^jd$/i },
  { name: "拼多多", slug: "pdd", keywords: ["pdd", "pinduoduo", "temu"], match: /拼多多|pdd|pinduoduo|temu/i },
  { name: "小米", slug: "xiaomi", keywords: ["xm", "xiaomi", "mi"], match: /小米|xiaomi/i },
  { name: "网易", slug: "netease", keywords: ["wy", "netease", "163"], match: /网易|netease/i },
  { name: "哔哩哔哩", slug: "bilibili", keywords: ["blbl", "b站", "bilibili"], match: /哔哩|b站|bilibili/i },
  { name: "携程", slug: "ctrip", keywords: ["xc", "ctrip", "trip"], match: /携程|trip\.com|ctrip/i },
  { name: "去哪儿", slug: "qunar", keywords: ["qne", "qunar"], match: /去哪儿|qunar/i },
  { name: "大疆", slug: "dji", keywords: ["dj", "dji"], match: /大疆|dji/i, invertInDark: true },
  { name: "得物", slug: "dewu", keywords: ["dw", "dewu", "poizon"], match: /得物|poizon|dewu/i, invertInDark: true },
  { name: "哈啰", slug: "hellobike", keywords: ["hl", "hellobike", "hello"], match: /哈啰|hellobike/i },
  { name: "招银网络科技", slug: "cmb", keywords: ["zy", "cmb", "招商银行"], match: /招银|招商银行|cmb/i },
  { name: "OPPO", slug: "oppo", keywords: ["oppo"], match: /oppo/i },
  { name: "vivo", slug: "vivo", keywords: ["vivo"], match: /vivo/i },
  { name: "搜狐畅游", slug: "changyou", keywords: ["cy", "changyou"], match: /畅游|changyou/i },
  { name: "搜狐", slug: "sohu", keywords: ["sh", "sohu"], match: /搜狐|sohu/i },
  { name: "作业帮", slug: "zuoyebang", keywords: ["zyb", "zuoyebang"], match: /作业帮|zuoyebang/i },
  { name: "SHEIN", slug: "shein", keywords: ["shein", "希音"], match: /shein|希音/i, invertInDark: true },
  { name: "Shopee", slug: "shopee", keywords: ["shopee", "虾皮", "sea"], match: /shopee|虾皮/i },
  { name: "百度", slug: "baidu", keywords: ["bd", "baidu"], match: /百度|baidu/i },
  { name: "蔚来", slug: "nio", keywords: ["wl", "nio"], match: /蔚来|nio/i, invertInDark: true },
  { name: "途虎养车", slug: "tuhu", keywords: ["th", "tuhu", "途虎"], match: /途虎|tuhu/i },
  { name: "影石 Insta360", slug: "insta360", keywords: ["ys", "insta360", "影石"], match: /影石|insta360/i },
  { name: "智元机器人", slug: "agibot", keywords: ["zy", "agibot", "智元"], match: /智元|agibot/i },
  { name: "文远知行", slug: "weride", keywords: ["wyzx", "weride", "文远"], match: /文远|weride/i },
  { name: "合合信息", slug: "intsig", keywords: ["hh", "intsig", "合合"], match: /合合|intsig/i },
  { name: "拓竹科技", slug: "bambulab", keywords: ["tz", "bambulab", "拓竹"], match: /拓竹|bambu/i },
  { name: "深信服", slug: "sangfor", keywords: ["sxf", "sangfor"], match: /深信服|sangfor/i },
  { name: "CVTE", slug: "cvte", keywords: ["cvte", "视源"], match: /cvte|视源/i, invertInDark: true },
  { name: "沐瞳科技", slug: "moonton", keywords: ["mt", "moonton", "沐瞳"], match: /沐瞳|moonton/i },
  { name: "货拉拉", slug: "huolala", keywords: ["hll", "huolala"], match: /货拉拉|huolala/i },
  { name: "三七互娱", slug: "sanqi", keywords: ["sq", "37", "sanqi"], match: /三七|37互娱/i },
  { name: "贝壳", slug: "ke", keywords: ["bk", "ke", "链家"], match: /贝壳|链家|ke\.com/i },
  { name: "米哈游", slug: "mihoyo", keywords: ["mhy", "mihoyo", "hoyoverse"], match: /米哈游|mihoyo|hoyoverse/i },
  { name: "DeepSeek", slug: "deepseek", keywords: ["ds", "deepseek", "深度求索"], match: /deepseek|深度求索/i },
  { name: "月之暗面", slug: "kimi", keywords: ["kimi", "moonshot", "yzam"], match: /kimi|月之暗面|moonshot/i, invertInDark: true },
  { name: "智谱", slug: "zhipu", keywords: ["zp", "zhipu"], match: /智谱|zhipu/i },
  { name: "MiniMax", slug: "minimax", keywords: ["minimax", "mm"], match: /minimax/i },
  { name: "商汤", slug: "sensetime", keywords: ["st", "sensetime"], match: /商汤|sensetime/i },
  { name: "Google", slug: "google", keywords: ["google", "谷歌"], match: /谷歌|google/i },
  { name: "Microsoft", slug: "microsoft", keywords: ["microsoft", "微软", "msra"], match: /微软|microsoft|msra/i },
  { name: "Apple", slug: "apple", keywords: ["apple", "苹果"], match: /苹果|apple/i, invertInDark: true },
  { name: "Amazon", slug: "amazon", keywords: ["amazon", "aws", "亚马逊"], match: /亚马逊|amazon|aws/i },
  { name: "Meta", slug: "meta", keywords: ["meta", "facebook"], match: /meta|facebook/i },
  { name: "NVIDIA", slug: "nvidia", keywords: ["nvidia", "nv", "英伟达"], match: /英伟达|nvidia/i },
  { name: "OpenAI", slug: "openai", keywords: ["openai"], match: /openai/i, invertInDark: true },
  { name: "Anthropic", slug: "anthropic", keywords: ["anthropic", "claude"], match: /anthropic|claude/i },
  { name: "Cloudflare", slug: "cloudflare", keywords: ["cloudflare", "cf"], match: /cloudflare/i },
];

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
