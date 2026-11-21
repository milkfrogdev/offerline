import React from "react";
import {
  siAirbnb,
  siAlibabacloud,
  siAlibabadotcom,
  siAlipay,
  siAmd,
  siAnthropic,
  siApple,
  siBaidu,
  siBilibili,
  siBytedance,
  siCisco,
  siCloudflare,
  siDatabricks,
  siDeepseek,
  siDji,
  siEbay,
  siGoogle,
  siHonor,
  siHuawei,
  siIntel,
  siKuaishou,
  siLenovo,
  siLinear,
  siMeituan,
  siMeta,
  siMihoyo,
  siNeteasecloudmusic,
  siNetflix,
  siNvidia,
  siOppo,
  siPalantir,
  siPaypal,
  siQq,
  siSamsung,
  siSap,
  siShopee,
  siSinaweibo,
  siSony,
  siStripe,
  siTaobao,
  siTencenthy,
  siTesla,
  siTiktok,
  siTplink,
  siTripdotcom,
  siUber,
  siVivo,
  siWechat,
  siXiaohongshu,
  siXiaomi,
  siZhihu,
  siZilliz,
  type SimpleIcon,
} from "simple-icons";

interface BrandSpec {
  match: RegExp;
  icon?: SimpleIcon;
  custom?: "microsoft" | "amazon" | "openai" | "jd" | "pdd" | "didi" | "feishu";
  hex: string;
  invertInDark?: boolean;
}

const BRAND_CATALOG: BrandSpec[] = [
  { match: /微信|wechat/i, icon: siWechat, hex: "07C160" },
  { match: /混元|hunyuan/i, icon: siTencenthy, hex: "0052D9" },
  { match: /腾讯|tencent|\bqq\b/i, icon: siQq, hex: "12B7F5" },
  { match: /飞书|lark|feishu/i, custom: "feishu", hex: "00D6B9" },
  { match: /抖音|tiktok/i, icon: siTiktok, hex: "161615", invertInDark: true },
  { match: /字节|bytedance/i, icon: siBytedance, hex: "325AB4" },
  { match: /阿里云|alibabacloud/i, icon: siAlibabacloud, hex: "FF6A00" },
  { match: /淘宝|天猫|淘天|taobao/i, icon: siTaobao, hex: "FF5000" },
  { match: /蚂蚁|支付宝|ant\s*group|alipay/i, icon: siAlipay, hex: "1677FF" },
  { match: /阿里|alibaba/i, icon: siAlibabadotcom, hex: "FF6A00" },
  { match: /美团|大众点评|meituan/i, icon: siMeituan, hex: "FFC300" },
  { match: /小红书|xiaohongshu|rednote/i, icon: siXiaohongshu, hex: "FF2442" },
  { match: /华为|海思|huawei/i, icon: siHuawei, hex: "CF0A2C" },
  { match: /荣耀|honor/i, icon: siHonor, hex: "161615", invertInDark: true },
  { match: /京东|jd\.com|^jd$/i, custom: "jd", hex: "E1251B" },
  { match: /拼多多|pdd|pinduoduo|temu/i, custom: "pdd", hex: "E02E24" },
  { match: /滴滴|didi/i, custom: "didi", hex: "FF7A00" },
  { match: /百度|baidu/i, icon: siBaidu, hex: "2932E1" },
  { match: /小米|xiaomi/i, icon: siXiaomi, hex: "FF6900" },
  { match: /哔哩|b站|bilibili/i, icon: siBilibili, hex: "00A1D6" },
  { match: /快手|kuaishou/i, icon: siKuaishou, hex: "FF4906" },
  { match: /网易|netease/i, icon: siNeteasecloudmusic, hex: "D43C33" },
  { match: /米哈游|mihoyo|hoyoverse/i, icon: siMihoyo, hex: "161615", invertInDark: true },
  { match: /携程|trip\.com|ctrip/i, icon: siTripdotcom, hex: "287DFA" },
  { match: /大疆|dji/i, icon: siDji, hex: "161615", invertInDark: true },
  { match: /虾皮|shopee|sea/i, icon: siShopee, hex: "EE4D2D" },
  { match: /oppo/i, icon: siOppo, hex: "046A38" },
  { match: /vivo/i, icon: siVivo, hex: "415FFF" },
  { match: /联想|lenovo/i, icon: siLenovo, hex: "E2231A" },
  { match: /微博|新浪|weibo/i, icon: siSinaweibo, hex: "E6162D" },
  { match: /知乎|zhihu/i, icon: siZhihu, hex: "0066FF" },
  { match: /deepseek|深度求索/i, icon: siDeepseek, hex: "4D6BFE" },
  { match: /tp-?link|普联/i, icon: siTplink, hex: "4ACBD6" },
  { match: /微软|microsoft|msra/i, custom: "microsoft", hex: "00A4EF" },
  { match: /亚马逊|amazon|aws/i, custom: "amazon", hex: "FF9900" },
  { match: /openai/i, custom: "openai", hex: "161615", invertInDark: true },
  { match: /anthropic/i, icon: siAnthropic, hex: "191919", invertInDark: true },
  { match: /谷歌|google/i, icon: siGoogle, hex: "4285F4" },
  { match: /苹果|apple/i, icon: siApple, hex: "161615", invertInDark: true },
  { match: /meta|facebook/i, icon: siMeta, hex: "0467DF" },
  { match: /英伟达|nvidia/i, icon: siNvidia, hex: "76B900" },
  { match: /特斯拉|tesla/i, icon: siTesla, hex: "CC0000" },
  { match: /stripe/i, icon: siStripe, hex: "635BFF" },
  { match: /uber|优步/i, icon: siUber, hex: "161615", invertInDark: true },
  { match: /airbnb|爱彼迎/i, icon: siAirbnb, hex: "FF5A5F" },
  { match: /paypal/i, icon: siPaypal, hex: "003087" },
  { match: /英特尔|intel/i, icon: siIntel, hex: "0071C5" },
  { match: /\bamd\b/i, icon: siAmd, hex: "161615", invertInDark: true },
  { match: /思科|cisco/i, icon: siCisco, hex: "1BA0D7" },
  { match: /\bsap\b/i, icon: siSap, hex: "0FAAFF" },
  { match: /databricks/i, icon: siDatabricks, hex: "FF3621" },
  { match: /netflix/i, icon: siNetflix, hex: "E50914" },
  { match: /三星|samsung/i, icon: siSamsung, hex: "1428A0" },
  { match: /索尼|sony/i, icon: siSony, hex: "161615", invertInDark: true },
  { match: /ebay/i, icon: siEbay, hex: "E53238" },
  { match: /cloudflare/i, icon: siCloudflare, hex: "F38020" },
  { match: /linear/i, icon: siLinear, hex: "5E6AD2" },
  { match: /palantir/i, icon: siPalantir, hex: "161615", invertInDark: true },
  { match: /zilliz/i, icon: siZilliz, hex: "00A1EA" },
];

function CustomBrandSvg({ kind }: { kind: NonNullable<BrandSpec["custom"]> }) {
  if (kind === "microsoft") {
    return (
      <svg viewBox="0 0 24 24" className="brand-svg" aria-hidden="true">
        <rect x="2.5" y="2.5" width="8.8" height="8.8" fill="#F25022" />
        <rect x="12.7" y="2.5" width="8.8" height="8.8" fill="#7FBA00" />
        <rect x="2.5" y="12.7" width="8.8" height="8.8" fill="#00A4EF" />
        <rect x="12.7" y="12.7" width="8.8" height="8.8" fill="#FFB900" />
      </svg>
    );
  }
  if (kind === "amazon") {
    return (
      <svg viewBox="0 0 24 24" className="brand-svg" aria-hidden="true">
        <path
          d="M15.8 14.3c-.2-.2-.5-.4-.6-.9V9.6c0-1.6-.1-3-1.2-4-1-.9-2.4-1.2-3.7-1.2-2.2 0-4.2.9-4.7 3.2-.1.3.1.4.3.5l2.1.2c.2 0 .4-.2.4-.4.2-1 1-1.5 1.9-1.5.5 0 1.1.2 1.4.7.3.5.3 1.2.3 1.7v.3c-1.5.2-3.5.3-4.9 1-1.6.7-2.6 2-2.6 3.9 0 2.3 1.5 3.5 3.4 3.5 1.6 0 2.5-.4 3.7-1.6.4.6.6.9 1.4 1.5.2.1.4.1.6-.1l1.9-1.6c.2-.2.2-.5 0-.7Zm-3.8-.8c0 .9 0 1.7-.5 2.4-.4.7-1 1.1-1.7 1.1-.9 0-1.5-.7-1.5-1.7 0-2 1.8-2.4 3.7-2.4v.6Z"
          fill="currentColor"
        />
        <path
          d="M19.8 17.5c-2.2 1.6-5.4 2.5-8.1 2.5-3.8 0-7.3-1.4-9.9-3.8-.2-.2 0-.4.2-.3 2.8 1.6 6.3 2.6 9.9 2.6 2.4 0 5.1-.5 7.5-1.5.4-.2.7.2.4.5Z"
          fill="#FF9900"
        />
        <path
          d="M20.7 16.5c-.3-.4-1.9-.2-2.6-.1-.2 0-.3-.2-.1-.3 1.3-.9 3.4-.6 3.7-.3.2.3-.1 2.4-1.3 3.4-.2.2-.4.1-.3-.1.3-.7.9-2.2.6-2.6Z"
          fill="#FF9900"
        />
      </svg>
    );
  }
  if (kind === "openai") {
    return (
      <svg viewBox="0 0 24 24" className="brand-svg" aria-hidden="true">
        <path
          d="M20.7 9.8a5.2 5.2 0 0 0-.4-4.3 5.3 5.3 0 0 0-5.7-2.5 5.2 5.2 0 0 0-3.9-1.7 5.3 5.3 0 0 0-5 3.6 5.2 5.2 0 0 0-3.5 2.5 5.3 5.3 0 0 0 .7 6.2 5.2 5.2 0 0 0 .4 4.3 5.3 5.3 0 0 0 5.7 2.5 5.2 5.2 0 0 0 3.9 1.7 5.3 5.3 0 0 0 5-3.6 5.2 5.2 0 0 0 3.5-2.5 5.3 5.3 0 0 0-.7-6.2ZM12.9 20.8a3.9 3.9 0 0 1-2.5-.9l.1-.1 4.2-2.4a.7.7 0 0 0 .3-.6v-5.9l1.8 1v4.9a4 4 0 0 1-3.9 4Zm-8.4-3.6a3.9 3.9 0 0 1-.5-2.6l.1.1 4.2 2.4a.7.7 0 0 0 .7 0l5.1-3v2l-4.2 2.4a4 4 0 0 1-5.4-1.3Zm-1.1-9a3.9 3.9 0 0 1 2-1.7v5a.7.7 0 0 0 .3.6l5.1 2.9-1.8 1-4.2-2.4a4 4 0 0 1-1.4-5.4Zm14.5 3.4-5.1-3 1.8-1 4.2 2.4a4 4 0 0 1-.6 7.2v-5a.7.7 0 0 0-.3-.6Zm1.7-2.7-.1-.1-4.2-2.4a.7.7 0 0 0-.7 0l-5.1 3v-2l4.2-2.4a4 4 0 0 1 5.9 3.9Zm-11.1 3.6-1.8-1V6.6a4 4 0 0 1 6.5-3.1l-.1.1-4.2 2.4a.7.7 0 0 0-.4.6v5.9Zm1-2.1 2.3-1.3 2.3 1.3v2.6l-2.3 1.3-2.3-1.3v-2.6Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (kind === "feishu") {
    return (
      <svg viewBox="0 0 24 24" className="brand-svg" aria-hidden="true">
        <path d="M4 5.5 13.5 9.2 11 14.5 4 5.5Z" fill="#00D6B9" />
        <path d="M13.5 9.2 20 6.5 14.2 18.8 11 14.5l2.5-5.3Z" fill="#3370FF" />
        <path d="M4 5.5 11 14.5 9.2 19 4 12.2V5.5Z" fill="#1456F0" />
      </svg>
    );
  }
  if (kind === "jd") {
    return (
      <svg viewBox="0 0 24 24" className="brand-svg" aria-hidden="true">
        <rect x="2.5" y="4.5" width="19" height="15" rx="4" fill="#E1251B" />
        <text
          x="12"
          y="15.2"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="9.2"
          fontWeight="800"
          fontFamily="Segoe UI, Arial, sans-serif"
        >
          JD
        </text>
      </svg>
    );
  }
  if (kind === "pdd") {
    return (
      <svg viewBox="0 0 24 24" className="brand-svg" aria-hidden="true">
        <rect x="2.5" y="4.5" width="19" height="15" rx="4" fill="#E02E24" />
        <text
          x="12"
          y="15"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="8"
          fontWeight="800"
          fontFamily="Segoe UI, Arial, sans-serif"
        >
          PDD
        </text>
      </svg>
    );
  }
  // didi
  return (
    <svg viewBox="0 0 24 24" className="brand-svg" aria-hidden="true">
      <path
        d="M5 7h8.2a6.2 6.2 0 1 1 0 12.4H11a6 6 0 0 1-6-6V7Zm3.4 3.2v3.2a2.6 2.6 0 0 0 2.6 2.6h2.2a2.9 2.9 0 0 0 0-5.8H8.4Z"
        fill="#FF7A00"
      />
    </svg>
  );
}

export function CompanyLogo({
  company,
  size = "md",
}: {
  company: string;
  size?: "sm" | "md";
}) {
  const name = company.trim();
  const matched = BRAND_CATALOG.find((item) => item.match.test(name));
  const cls = `company-logo company-logo-${size}${matched?.invertInDark ? " is-mono" : ""}`;

  if (matched?.custom) {
    return (
      <span className={cls} title={name} aria-hidden="true">
        <CustomBrandSvg kind={matched.custom} />
      </span>
    );
  }

  if (matched?.icon) {
    const fill = matched.invertInDark ? "currentColor" : `#${matched.hex}`;
    return (
      <span className={cls} title={name} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="brand-svg" fill={fill}>
          <path d={matched.icon.path} />
        </svg>
      </span>
    );
  }

  const monogram = name.slice(0, 1).toUpperCase() || "O";
  return (
    <span className={`${cls} is-monogram`} title={name} aria-hidden="true">
      {monogram}
    </span>
  );
}
