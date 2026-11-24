export interface BrandEntry {
  name: string;
  slug: string;
  group: string;
  keywords: string[];
  match: RegExp;
  domains?: string[];
  invertInDark?: boolean;
  whiteInDark?: boolean;
}

/**
 * 统一品牌词典（按特异性从高到低排列：子公司/独立品牌在前，母公司/集团在后）。
 * 前后端共用：前端用于高清 Logo 与输入联想，后端用于邮件公司名归一化与同集团记录关联。
 */
export const BRAND_DIRECTORY: BrandEntry[] = [
  {
    name: "腾讯音乐",
    slug: "tme",
    group: "tencent",
    keywords: ["tme", "txyy", "qq音乐", "tencent music"],
    match: /腾讯音乐|tme\b|tencent\s*music/i,
    domains: ["tencentmusic.com"],
  },
  {
    name: "腾讯云",
    slug: "tencentcloud",
    group: "tencent",
    keywords: ["txy", "tencentcloud"],
    match: /腾讯云|tencent\s*cloud/i,
  },
  {
    name: "腾讯",
    slug: "tencent",
    group: "tencent",
    keywords: ["tx", "tencent", "qq", "微信", "wechat"],
    match: /腾讯|tencent/i,
    domains: ["tencent.com"],
  },
  {
    name: "字节跳动",
    slug: "bytedance",
    group: "bytedance",
    keywords: ["zj", "zjtd", "bytedance", "抖音", "飞书", "tiktok"],
    match: /字节跳动|字节|bytedance|飞书|抖音|tiktok/i,
    domains: ["bytedance.com", "bytedance.net", "larkoffice.com", "tiktok.com"],
  },
  {
    name: "阿里云",
    slug: "alibabacloud",
    group: "alibaba",
    keywords: ["aly", "aliyun", "alibabacloud"],
    match: /阿里云|aliyun|alibaba\s*cloud/i,
    domains: ["aliyun.com"],
  },
  {
    name: "蚂蚁集团",
    slug: "ant",
    group: "ant",
    keywords: ["my", "ant", "alipay", "支付宝"],
    match: /蚂蚁集团|蚂蚁科技|蚂蚁金服|蚂蚁|支付宝|ant\s*group|alipay/i,
    domains: ["antgroup.com", "alipay.com"],
  },
  {
    name: "阿里巴巴",
    slug: "alibaba",
    group: "alibaba",
    keywords: ["al", "ali", "alibaba", "淘宝", "淘天", "天猫"],
    match: /阿里巴巴|阿里|淘宝|天猫|淘天|alibaba/i,
    domains: ["alibaba-inc.com", "alibabagroup.com", "taobao.com"],
  },
  {
    name: "可灵",
    slug: "kling",
    group: "kuaishou",
    keywords: ["kl", "kling"],
    match: /可灵|\bkling\b/i,
  },
  {
    name: "快手",
    slug: "kuaishou",
    group: "kuaishou",
    keywords: ["ks", "kuaishou"],
    match: /快手|kuaishou/i,
    domains: ["kuaishou.com"],
  },
  {
    name: "科大讯飞",
    slug: "iflytek",
    group: "iflytek",
    keywords: ["kdxf", "xf", "iflytek", "讯飞"],
    match: /科大讯飞|讯飞|iflytek/i,
    domains: ["iflytek.com"],
    whiteInDark: true,
  },
  {
    name: "滴滴",
    slug: "didi",
    group: "didi",
    keywords: ["dd", "didi", "小桔"],
    match: /滴滴|小桔|\bdidi\b/i,
    domains: ["didiglobal.com", "didichuxing.com"],
  },
  {
    name: "华为",
    slug: "huawei",
    group: "huawei",
    keywords: ["hw", "huawei", "海思"],
    match: /华为|海思|huawei/i,
    domains: ["huawei.com"],
  },
  {
    name: "美团",
    slug: "meituan",
    group: "meituan",
    keywords: ["mt", "meituan", "大众点评"],
    match: /美团|大众点评|meituan/i,
    domains: ["meituan.com", "dianping.com"],
  },
  {
    name: "小红书",
    slug: "xiaohongshu",
    group: "xiaohongshu",
    keywords: ["xhs", "xiaohongshu", "rednote"],
    match: /小红书|行吟|xiaohongshu|rednote/i,
    domains: ["xiaohongshu.com", "xingin.com"],
  },
  {
    name: "京东",
    slug: "jd",
    group: "jd",
    keywords: ["jd", "jingdong"],
    match: /京东|jd\.com|^jd$/i,
    domains: ["jd.com"],
  },
  {
    name: "拼多多",
    slug: "pdd",
    group: "pdd",
    keywords: ["pdd", "pinduoduo", "temu"],
    match: /拼多多|寻梦|pdd|pinduoduo|\btemu\b/i,
    domains: ["pinduoduo.com", "pdd.com"],
  },
  {
    name: "小米",
    slug: "xiaomi",
    group: "xiaomi",
    keywords: ["xm", "xiaomi", "mi"],
    match: /小米|xiaomi/i,
    domains: ["xiaomi.com"],
  },
  {
    name: "网易",
    slug: "netease",
    group: "netease",
    keywords: ["wy", "netease", "163"],
    match: /网易|netease/i,
    domains: ["corp.netease.com", "netease.com"],
  },
  {
    name: "哔哩哔哩",
    slug: "bilibili",
    group: "bilibili",
    keywords: ["blbl", "b站", "bilibili"],
    match: /哔哩哔哩|哔哩|b站|bilibili/i,
    domains: ["bilibili.com"],
  },
  {
    name: "携程",
    slug: "ctrip",
    group: "ctrip",
    keywords: ["xc", "ctrip", "trip"],
    match: /携程|trip\.com|ctrip/i,
    domains: ["trip.com", "ctrip.com"],
  },
  {
    name: "去哪儿",
    slug: "qunar",
    group: "qunar",
    keywords: ["qne", "qunar"],
    match: /去哪儿|qunar/i,
    domains: ["qunar.com"],
  },
  {
    name: "大疆",
    slug: "dji",
    group: "dji",
    keywords: ["dj", "dji"],
    match: /大疆|\bdji\b/i,
    domains: ["dji.com"],
    invertInDark: true,
  },
  {
    name: "得物",
    slug: "dewu",
    group: "dewu",
    keywords: ["dw", "dewu", "poizon"],
    match: /得物|识装|poizon|dewu/i,
    domains: ["shizhuang-inc.com", "dewu.com", "poizon.com"],
    invertInDark: true,
  },
  {
    name: "哈啰",
    slug: "hellobike",
    group: "hellobike",
    keywords: ["hl", "hellobike", "hello"],
    match: /哈啰|hellobike/i,
    domains: ["hellobike.com"],
  },
  {
    name: "招银网络科技",
    slug: "cmb",
    group: "cmb",
    keywords: ["zy", "cmb", "招商银行"],
    match: /招银|招商银行|\bcmb\b/i,
    domains: ["cmbchina.com", "cmbnt.com"],
  },
  {
    name: "OPPO",
    slug: "oppo",
    group: "oppo",
    keywords: ["oppo"],
    match: /\boppo\b|欧珀/i,
    domains: ["oppo.com"],
  },
  {
    name: "vivo",
    slug: "vivo",
    group: "vivo",
    keywords: ["vivo"],
    match: /\bvivo\b|维沃/i,
    domains: ["vivo.com"],
  },
  {
    name: "搜狐畅游",
    slug: "changyou",
    group: "sohu",
    keywords: ["cy", "changyou"],
    match: /畅游|changyou/i,
    domains: ["cyou-inc.com"],
  },
  {
    name: "搜狐",
    slug: "sohu",
    group: "sohu",
    keywords: ["sh", "sohu"],
    match: /搜狐|sohu/i,
    domains: ["sohu-inc.com", "sohu.com"],
  },
  {
    name: "作业帮",
    slug: "zuoyebang",
    group: "zuoyebang",
    keywords: ["zyb", "zuoyebang"],
    match: /作业帮|zuoyebang/i,
    domains: ["zuoyebang.com"],
  },
  {
    name: "SHEIN",
    slug: "shein",
    group: "shein",
    keywords: ["shein", "希音"],
    match: /shein|希音/i,
    domains: ["shein.com", "sheingroup.com"],
    invertInDark: true,
  },
  {
    name: "Shopee",
    slug: "shopee",
    group: "shopee",
    keywords: ["shopee", "虾皮", "sea"],
    match: /shopee|虾皮/i,
    domains: ["shopee.com", "sea.com"],
  },
  {
    name: "百度",
    slug: "baidu",
    group: "baidu",
    keywords: ["bd", "baidu"],
    match: /百度|baidu/i,
    domains: ["baidu.com"],
  },
  {
    name: "蔚来",
    slug: "nio",
    group: "nio",
    keywords: ["wl", "nio"],
    match: /蔚来|\bnio\b/i,
    domains: ["nio.com"],
    invertInDark: true,
  },
  {
    name: "途虎养车",
    slug: "tuhu",
    group: "tuhu",
    keywords: ["th", "tuhu", "途虎"],
    match: /途虎|tuhu/i,
    domains: ["tuhu.cn"],
  },
  {
    name: "影石 Insta360",
    slug: "insta360",
    group: "insta360",
    keywords: ["ys", "insta360", "影石"],
    match: /影石|insta360/i,
    domains: ["insta360.com"],
  },
  {
    name: "智元机器人",
    slug: "agibot",
    group: "agibot",
    keywords: ["zy", "agibot", "智元"],
    match: /智元|agibot/i,
    domains: ["agibot.com"],
  },
  {
    name: "文远知行",
    slug: "weride",
    group: "weride",
    keywords: ["wyzx", "weride", "文远"],
    match: /文远|weride/i,
    domains: ["weride.ai"],
  },
  {
    name: "合合信息",
    slug: "intsig",
    group: "intsig",
    keywords: ["hh", "intsig", "合合"],
    match: /合合|intsig/i,
    domains: ["intsig.com"],
  },
  {
    name: "拓竹科技",
    slug: "bambulab",
    group: "bambulab",
    keywords: ["tz", "bambulab", "拓竹"],
    match: /拓竹|bambu/i,
    domains: ["bambulab.com"],
  },
  {
    name: "深信服",
    slug: "sangfor",
    group: "sangfor",
    keywords: ["sxf", "sangfor"],
    match: /深信服|sangfor/i,
    domains: ["sangfor.com.cn", "sangfor.com"],
  },
  {
    name: "CVTE",
    slug: "cvte",
    group: "cvte",
    keywords: ["cvte", "视源"],
    match: /cvte|视源/i,
    domains: ["cvte.com"],
    invertInDark: true,
  },
  {
    name: "沐瞳科技",
    slug: "moonton",
    group: "bytedance",
    keywords: ["mt", "moonton", "沐瞳"],
    match: /沐瞳|moonton/i,
    domains: ["moonton.com"],
  },
  {
    name: "货拉拉",
    slug: "huolala",
    group: "huolala",
    keywords: ["hll", "huolala"],
    match: /货拉拉|huolala/i,
    domains: ["huolala.cn", "lalamove.com"],
  },
  {
    name: "三七互娱",
    slug: "sanqi",
    group: "sanqi",
    keywords: ["sq", "37", "sanqi"],
    match: /三七|37互娱/i,
    domains: ["37.com"],
  },
  {
    name: "贝壳",
    slug: "ke",
    group: "ke",
    keywords: ["bk", "ke", "链家"],
    match: /贝壳|链家|ke\.com/i,
    domains: ["ke.com", "lianjia.com"],
  },
  {
    name: "米哈游",
    slug: "mihoyo",
    group: "mihoyo",
    keywords: ["mhy", "mihoyo", "hoyoverse"],
    match: /米哈游|mihoyo|hoyoverse/i,
    domains: ["mihoyo.com", "hoyoverse.com"],
  },
  {
    name: "DeepSeek",
    slug: "deepseek",
    group: "deepseek",
    keywords: ["ds", "deepseek", "深度求索"],
    match: /deepseek|深度求索/i,
    domains: ["deepseek.com"],
  },
  {
    name: "月之暗面",
    slug: "kimi",
    group: "moonshot",
    keywords: ["kimi", "moonshot", "yzam"],
    match: /kimi|月之暗面|moonshot/i,
    domains: ["moonshot.cn"],
    invertInDark: true,
  },
  {
    name: "智谱",
    slug: "zhipu",
    group: "zhipu",
    keywords: ["zp", "zhipu"],
    match: /智谱|zhipu/i,
    domains: ["zhipuai.cn"],
  },
  {
    name: "MiniMax",
    slug: "minimax",
    group: "minimax",
    keywords: ["minimax", "mm"],
    match: /minimax/i,
    domains: ["minimaxi.com"],
  },
  {
    name: "商汤",
    slug: "sensetime",
    group: "sensetime",
    keywords: ["st", "sensetime"],
    match: /商汤|sensetime/i,
    domains: ["sensetime.com"],
  },
  {
    name: "Google",
    slug: "google",
    group: "google",
    keywords: ["google", "谷歌"],
    match: /谷歌|\bgoogle\b/i,
    domains: ["google.com"],
  },
  {
    name: "Microsoft",
    slug: "microsoft",
    group: "microsoft",
    keywords: ["microsoft", "微软", "msra"],
    match: /微软|\bmicrosoft\b|\bmsra\b/i,
    domains: ["microsoft.com"],
  },
  {
    name: "Apple",
    slug: "apple",
    group: "apple",
    keywords: ["apple", "苹果"],
    match: /苹果|\bapple\b/i,
    domains: ["apple.com"],
    invertInDark: true,
  },
  {
    name: "Amazon",
    slug: "amazon",
    group: "amazon",
    keywords: ["amazon", "aws", "亚马逊"],
    match: /亚马逊|\bamazon\b|\baws\b/i,
    domains: ["amazon.com"],
  },
  {
    name: "Meta",
    slug: "meta",
    group: "meta",
    keywords: ["meta", "facebook"],
    match: /\bmeta\b|facebook/i,
    domains: ["meta.com", "fb.com"],
  },
  {
    name: "NVIDIA",
    slug: "nvidia",
    group: "nvidia",
    keywords: ["nvidia", "nv", "英伟达"],
    match: /英伟达|\bnvidia\b/i,
    domains: ["nvidia.com"],
  },
  {
    name: "OpenAI",
    slug: "openai",
    group: "openai",
    keywords: ["openai"],
    match: /\bopenai\b/i,
    domains: ["openai.com"],
    invertInDark: true,
  },
  {
    name: "Anthropic",
    slug: "anthropic",
    group: "anthropic",
    keywords: ["anthropic", "claude"],
    match: /\banthropic\b|\bclaude\b/i,
    domains: ["anthropic.com"],
  },
  {
    name: "Cloudflare",
    slug: "cloudflare",
    group: "cloudflare",
    keywords: ["cloudflare", "cf"],
    match: /\bcloudflare\b/i,
    domains: ["cloudflare.com"],
  },
  {
    name: "Stripe",
    slug: "stripe",
    group: "stripe",
    keywords: ["stripe"],
    match: /\bstripe\b/i,
    domains: ["stripe.com"],
  },
  {
    name: "Tesla",
    slug: "tesla",
    group: "tesla",
    keywords: ["tesla", "特斯拉"],
    match: /特斯拉|\btesla\b/i,
    domains: ["tesla.com"],
  },
];

const GENERIC_SENDER_RE =
  /^(?:no-?reply|noreply|do-?not-?reply|hr|hrms|hrbp|talent|recruit|recruiting|recruitment|campus|careers?|jobs?|people|system|admin|notification|notice|support|exam|test|interview|service|info|mail|hello|team|assessment|北森|beisen|moka|mokahr|飞书招聘|牛客|牛客网|nowcoder|赛码|赛码网|acmcoder|拉勾|boss直聘|boss|猎聘|智联招聘|智联推荐|智联|前程无忧|脉脉|实习僧|italent招聘助手|招聘管理系统|oa管理员|tme-oa管理员|招聘小秘书|校招小助手|招聘助手|校招助手|校园招聘|社会招聘|实习招聘|人才招聘|招聘中心|招聘团队|招聘组|招聘系统|人力资源部?|人事部?|系统通知|考试通知|面试提醒|面试邀请|面试通知|笔试邀请|笔试通知|在线考试|在线测评|人才测评|邀请函|通知|提醒|重要|紧急|面试|笔试|测评|校招|社招|秋招|春招|邀请|offer|确认|待确认公司)$/i;

const CITY_VENUE_TAG_RE =
  /^(?:北京|上海|深圳|广州|杭州|成都|武汉|南京|苏州|西安|重庆|天津|合肥|长沙|厦门|珠海|海外|全国)(?:场|站|专场|站点)?$/;

const FREE_MAIL_DOMAINS =
  /(?:^|\.)(?:qq\.com|foxmail\.com|163\.com|126\.com|yeah\.net|sina\.com|sohu\.com|gmail\.com|outlook\.com|hotmail\.com|live\.com|icloud\.com|yahoo\.com|proton\.me|protonmail\.com)$/i;

const ATS_PLATFORM_DOMAINS =
  /(?:^|\.)(?:mokahr\.com|mokahr\.co|beisen\.com|ibeisen\.com|italent\.cn|joinus\.cc|wisdomore\.com|zhaopin\.cn|shixiseng\.net|nowcoder\.net|nowcoder\.com|acmcoder\.com|greenhouse\.io|lever\.co|myworkday\.com|workday\.com|ashbyhq\.com|icims\.com|smartrecruiters\.com|sendcloud\.net|mailgun\.org|amazonses\.com)$/i;

export function isGenericCompanyOrSender(raw: string): boolean {
  const s = raw
    .trim()
    .replace(/^[【\[（(《<"']+|[】\]）)》>"']+$/g, "")
    .trim();
  if (!s || s.length < 2) return true;
  if (GENERIC_SENDER_RE.test(s)) return true;
  if (CITY_VENUE_TAG_RE.test(s)) return true;
  if (/[的之]$/.test(s)) return true;
  if (/^20\d{2}届?(?:校招|秋招|春招|校园招聘|社会招聘)?$/i.test(s)) return true;
  if (/^(?:小秘书|小助手|招聘|校招|社招|笔试|面试|测评)/.test(s) && s.length <= 6) return true;
  return false;
}

export function matchBrandEntry(text: string): BrandEntry | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return BRAND_DIRECTORY.find((b) => b.match.test(trimmed));
}

export function matchCompanyByDomain(domainRaw: string): string | null {
  const domain = domainRaw.trim().toLowerCase();
  if (!domain || FREE_MAIL_DOMAINS.test(domain) || ATS_PLATFORM_DOMAINS.test(domain)) {
    return null;
  }
  for (const b of BRAND_DIRECTORY) {
    if (!b.domains) continue;
    for (const d of b.domains) {
      if (domain === d || domain.endsWith(`.${d}`)) {
        return b.name;
      }
    }
  }
  return null;
}

export function matchCompanyByEmailAddress(fromRaw: string): string | null {
  const addrMatch = fromRaw.match(/([a-z0-9._%+-]+)@([a-z0-9.-]+)/i);
  if (!addrMatch) return null;
  const local = addrMatch[1].toLowerCase();
  const domain = addrMatch[2].toLowerCase();

  // First check direct corporate domain
  const byDomain = matchCompanyByDomain(domain);
  if (byDomain) return byDomain;

  // Moka / ATS tenant localpart pattern: e.g. shopee-no-reply@mail.mokahr.com, trip-no-reply@mail.mokahr.co
  if (ATS_PLATFORM_DOMAINS.test(domain)) {
    const tenantPrefix = local
      .replace(/[-_.]?(?:no-?reply|noreply|hr|campus|recruit|talent|mail|notice|system)$/gi, "")
      .trim();
    if (tenantPrefix.length >= 2 && !isGenericCompanyOrSender(tenantPrefix)) {
      const brand = matchBrandEntry(tenantPrefix);
      if (brand) return brand.name;
    }
  }
  return null;
}

/**
 * 将法定全称、双语后缀、招聘部门尾缀归一化为简洁标准公司名。
 * 例："深圳市大疆创新科技有限公司" -> "大疆"，"深圳虾皮信息科技有限公司" -> "Shopee"，
 * "字节跳动 ByteDance" -> "字节跳动"，"华为公司" -> "华为"。
 */
export function normalizeCompanyName(raw: string): string {
  if (!raw) return "";
  const cleaned = raw
    .replace(/^(?:Re|Fwd|回复|转发)\s*[:：]\s*/i, "")
    .replace(/[【】\[\]<>《》"']/g, " ")
    .replace(/[（(][^）)]{1,40}[）)]/g, " ")
    .replace(
      /(?:20\d{2}届?)?(?:校园招聘|社会招聘|实习招聘|人才招聘|招聘团队|招聘组|招聘中心|招聘系统|人力资源部?|面试通知|笔试通知|测评通知|校招|社招|秋招|春招|招聘|HRMS|HR|Careers?|Recruiting|Recruitment|Talent|Team)$/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || isGenericCompanyOrSender(cleaned)) return "";

  const brand = matchBrandEntry(cleaned);
  if (brand) return brand.name;

  // Strip statutory Chinese legal entity boilerplate for non-catalog companies
  let compact = cleaned
    .replace(
      /(?:信息科技|网络科技|创新科技|电子科技|软件科技|数据科技|智能科技|科技发展|数字科技|互联网科技|科技|网络|信息|软件|技术|数据|智能|股份|集团|有限|责任)+公司$/g,
      "",
    )
    .replace(/(?:有限公司|股份有限公司|有限责任公司|集团有限公司|集团|公司)$/g, "")
    .trim();

  // Only strip leading city name when a legal suffix was actually present
  if (compact !== cleaned) {
    compact = compact.replace(
      /^(?:北京|上海|深圳|广州|杭州|成都|武汉|南京|苏州|西安|重庆|天津|厦门|长沙|合肥|珠海|宁波|无锡|青岛|大连)市?/,
      "",
    );
  }

  compact = compact.replace(/[-—·:：]+$/g, "").trim();
  if (!compact || isGenericCompanyOrSender(compact)) return "";
  return compact.slice(0, 40);
}

export function getCompanyGroup(name: string): string | null {
  const brand = matchBrandEntry(name);
  return brand ? brand.group : null;
}
