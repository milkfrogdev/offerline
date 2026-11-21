import React from "react";

const brandAssets = import.meta.glob<string>("../assets/brands/*.{svg,png}", {
  eager: true,
  import: "default",
});

const ASSET_MAP: Record<string, string> = {};
for (const [path, url] of Object.entries(brandAssets)) {
  const m = path.match(/\/([^/]+)\.(svg|png)$/i);
  if (m) {
    const slug = m[1].toLowerCase();
    // 同名优先保留 svg
    if (!ASSET_MAP[slug] || m[2].toLowerCase() === "svg") {
      ASSET_MAP[slug] = url;
    }
  }
}

interface BrandRule {
  match: RegExp;
  slug: string;
  invertInDark?: boolean;
}

const BRAND_RULES: BrandRule[] = [
  { match: /腾讯音乐|tme/i, slug: "tme" },
  { match: /腾讯云/i, slug: "tencentcloud" },
  { match: /腾讯|tencent/i, slug: "tencent" },
  { match: /字节|bytedance|飞书|抖音|tiktok/i, slug: "bytedance" },
  { match: /阿里云|alibabacloud/i, slug: "alibabacloud" },
  { match: /蚂蚁|支付宝|ant\s*group|alipay/i, slug: "ant" },
  { match: /阿里|淘宝|天猫|淘天|alibaba/i, slug: "alibaba" },
  { match: /快手|kuaishou/i, slug: "kuaishou" },
  { match: /可灵|kling/i, slug: "kling" },
  { match: /科大讯飞|讯飞|iflytek/i, slug: "iflytek" },
  { match: /滴滴|didi/i, slug: "didi" },
  { match: /华为|海思|huawei/i, slug: "huawei" },
  { match: /美团|大众点评|meituan/i, slug: "meituan" },
  { match: /小红书|xiaohongshu|rednote/i, slug: "xiaohongshu" },
  { match: /京东|jd\.com|^jd$/i, slug: "jd" },
  { match: /拼多多|pdd|pinduoduo|temu/i, slug: "pdd" },
  { match: /小米|xiaomi/i, slug: "xiaomi" },
  { match: /网易|netease/i, slug: "netease" },
  { match: /哔哩|b站|bilibili/i, slug: "bilibili" },
  { match: /携程|trip\.com|ctrip/i, slug: "ctrip" },
  { match: /去哪儿|qunar/i, slug: "qunar" },
  { match: /大疆|dji/i, slug: "dji", invertInDark: true },
  { match: /得物|poizon|dewu/i, slug: "dewu", invertInDark: true },
  { match: /哈啰|hellobike/i, slug: "hellobike" },
  { match: /招银|招商银行|cmb/i, slug: "cmb" },
  { match: /oppo/i, slug: "oppo" },
  { match: /vivo/i, slug: "vivo" },
  { match: /畅游|changyou/i, slug: "changyou" },
  { match: /搜狐|sohu/i, slug: "sohu" },
  { match: /作业帮|zuoyebang/i, slug: "zuoyebang" },
  { match: /shein|希音/i, slug: "shein", invertInDark: true },
  { match: /shopee|虾皮/i, slug: "shopee" },
  { match: /百度|baidu/i, slug: "baidu" },
  { match: /蔚来|nio/i, slug: "nio", invertInDark: true },
  { match: /途虎|tuhu/i, slug: "tuhu" },
  { match: /影石|insta360/i, slug: "insta360" },
  { match: /智元|agibot/i, slug: "agibot" },
  { match: /文远|weride/i, slug: "weride" },
  { match: /合合|intsig/i, slug: "intsig" },
  { match: /拓竹|bambu/i, slug: "bambulab" },
  { match: /深信服|sangfor/i, slug: "sangfor" },
  { match: /cvte|视源/i, slug: "cvte", invertInDark: true },
  { match: /沐瞳|moonton/i, slug: "moonton" },
  { match: /货拉拉|huolala/i, slug: "huolala" },
  { match: /三七|37互娱/i, slug: "sanqi" },
  { match: /贝壳|链家|ke\.com/i, slug: "ke" },
  { match: /米哈游|mihoyo|hoyoverse/i, slug: "mihoyo" },
  { match: /deepseek|深度求索/i, slug: "deepseek" },
  { match: /kimi|月之暗面|moonshot/i, slug: "kimi", invertInDark: true },
  { match: /智谱|zhipu/i, slug: "zhipu" },
  { match: /minimax/i, slug: "minimax" },
  { match: /商汤|sensetime/i, slug: "sensetime" },
  { match: /谷歌|google/i, slug: "google" },
  { match: /微软|microsoft|msra/i, slug: "microsoft" },
  { match: /苹果|apple/i, slug: "apple", invertInDark: true },
  { match: /亚马逊|amazon|aws/i, slug: "amazon" },
  { match: /meta|facebook/i, slug: "meta" },
  { match: /英伟达|nvidia/i, slug: "nvidia" },
  { match: /openai/i, slug: "openai", invertInDark: true },
  { match: /anthropic|claude/i, slug: "anthropic" },
  { match: /cloudflare/i, slug: "cloudflare" },
];

export function CompanyLogo({
  company,
  size = "md",
}: {
  company: string;
  size?: "sm" | "md";
}) {
  const name = company.trim();
  const rule = BRAND_RULES.find((r) => r.match.test(name));
  const src = rule ? ASSET_MAP[rule.slug] : undefined;

  if (src) {
    return (
      <span
        className={`company-logo company-logo-${size}${rule?.invertInDark ? " invert-dark" : ""}`}
        title={name}
        aria-hidden="true"
      >
        <img src={src} alt="" className="brand-img" loading="lazy" decoding="async" />
      </span>
    );
  }

  const monogram = name.slice(0, 1).toUpperCase() || "O";
  return (
    <span className={`company-logo company-logo-${size} is-monogram`} title={name} aria-hidden="true">
      {monogram}
    </span>
  );
}
