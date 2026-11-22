import type { EmailParseResult, EventKind } from "../shared/types.js";
import { sanitizeExternalUrl } from "./security.js";

export interface RawEmailInput {
  subject: string;
  from: string;
  text: string;
  date?: Date | string;
}

export interface LlmEnhancerConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const KNOWN_DOMAINS: [RegExp, string][] = [
  [/tencent\.com|qq\.com/i, "腾讯"],
  [/bytedance\.com|larkoffice\.com/i, "字节跳动"],
  [/alibaba-inc\.com|alibabagroup\.com|taobao\.com|aliyun\.com/i, "阿里巴巴"],
  [/antgroup\.com|alipay\.com/i, "蚂蚁集团"],
  [/meituan\.com|dianping\.com/i, "美团"],
  [/pinduoduo\.com|pdd\.com/i, "拼多多"],
  [/xiaohongshu\.com|xingin\.com/i, "小红书"],
  [/huawei\.com/i, "华为"],
  [/jd\.com/i, "京东"],
  [/baidu\.com/i, "百度"],
  [/163\.com|netease\.com|corp\.netease\.com/i, "网易"],
  [/kuaishou\.com/i, "快手"],
  [/bilibili\.com/i, "哔哩哔哩"],
  [/mihoyo\.com|hoyoverse\.com/i, "米哈游"],
  [/trip\.com|ctrip\.com/i, "携程"],
  [/didiglobal\.com|didichuxing\.com/i, "滴滴"],
  [/xiaomi\.com/i, "小米"],
  [/dji\.com/i, "大疆"],
  [/oppo\.com/i, "OPPO"],
  [/vivo\.com/i, "vivo"],
  [/shopee\.com|sea\.com/i, "Shopee"],
  [/deepseek\.com/i, "DeepSeek"],
  [/google\.com/i, "Google"],
  [/microsoft\.com/i, "Microsoft"],
  [/apple\.com/i, "Apple"],
  [/meta\.com|fb\.com/i, "Meta"],
  [/amazon\.com/i, "Amazon"],
  [/nvidia\.com/i, "NVIDIA"],
  [/tesla\.com/i, "Tesla"],
  [/openai\.com/i, "OpenAI"],
  [/anthropic\.com/i, "Anthropic"],
  [/stripe\.com/i, "Stripe"],
];

const RECRUIT_PLATFORM_HINTS =
  /beisen|mokahr|nowcoder|feishu|larksuite|lagou|zhipin|liepin|zhaopin|greenhouse|lever\.co|workday|ashbyhq|icims|smartrecruiters|hire\.|recruit|careers|hr@|talent@|campus/i;

const NEGATIVE_SUBJECT_HINTS =
  /验证码|登录提醒|账单|发票|快递|订单|会员|优惠券|广告|退订|密码重置|verification code|otp|invoice|receipt|newsletter|security alert/i;

const RECRUIT_STRONG_KEYWORDS =
  /面试邀请|面试通知|面试安排|笔试通知|笔试邀请|在线笔试|在线测评|人才测评|性格测试|录用通知|offer通知|谈薪|感谢信|简历初筛|面试预约|视频面试|电话面试|现场面试|interview invitation|interview schedule|online assessment|coding test|technical interview|offer letter/i;

const RECRUIT_SOFT_KEYWORDS =
  /招聘|校招|社招|春招|秋招|实习生|投递|简历|一面|二面|三面|终面|hr面|笔试|测评|面试官|候选人|candidate|recruiting|recruitment|application/i;

function cleanCompany(raw: string): string {
  return raw
    .replace(/^(Re|Fwd|回复|转发)\s*[:：]\s*/i, "")
    .replace(/(校园招聘|社会招聘|实习招聘|人才招聘|招聘团队|招聘组|招聘中心|招聘系统|面试通知|笔试通知|测评通知|校招|社招|招聘|HR|Careers|Recruiting|Talent|Team)$/gi, "")
    .replace(/[【】\[\]（）()<>《》\-—·:：]/g, " ")
    .trim()
    .split(/\s+/)[0]
    ?.slice(0, 40) || "";
}

function extractCompany(subject: string, from: string, text: string): string {
  const bracketMatches = [...subject.matchAll(/[【\[]([^】\]]{2,30})[】\]]/g)];
  for (const m of bracketMatches) {
    const candidate = cleanCompany(m[1]);
    if (
      candidate &&
      !/^(通知|提醒|重要|紧急|面试|笔试|测评|校招|社招|秋招|春招|邀请|offer|hr|确认)$/i.test(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  const fromNameMatch = from.match(/^"?([^"<@]{2,40})"?\s*</);
  if (fromNameMatch) {
    const candidate = cleanCompany(fromNameMatch[1]);
    if (
      candidate &&
      !/^(no-?reply|noreply|hr|talent|recruit|campus|system|admin|notification|北森|moka|飞书招聘|牛客|拉勾|boss)$/i.test(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  const emailDomainMatch = from.match(/@([a-z0-9.-]+)/i);
  const domain = emailDomainMatch?.[1] || "";
  for (const [re, name] of KNOWN_DOMAINS) {
    if (re.test(domain) && !/qq\.com$|163\.com$/i.test(domain)) {
      return name;
    }
  }

  const bodyCompany = text.match(
    /(?:感谢您应聘|欢迎参加|诚邀您参加|您投递的|来自)\s*([^\s，,。！!（(【\[]{2,20})(?:的|20\d{2}|校园|社会|实习|技术|研发|后端|前端|算法|产品|面试|笔试)/,
  );
  if (bodyCompany?.[1]) {
    const candidate = cleanCompany(bodyCompany[1]);
    if (candidate) return candidate;
  }

  for (const [re, name] of KNOWN_DOMAINS) {
    if (re.test(subject) || re.test(text.slice(0, 400))) {
      return name;
    }
  }

  return "待确认公司";
}

function extractPosition(subject: string, text: string): string {
  const combined = `${subject}\n${text.slice(0, 1200)}`;
  const patterns = [
    /(?:应聘职位|投递岗位|面试岗位|应聘岗位|岗位名称|职位名称|申请职位|职位|岗位)\s*[:：]\s*([^\n\r，,。；;（(]{2,48})/,
    /(?:Position|Role|Job Title)\s*[:：]\s*([^\n\r,;()]{2,56})/i,
    /[-—]\s*([^\n\r【】\[\]（()）]{2,36}(?:工程师|开发|研发|算法|架构师|产品经理|设计师|测试|运维|实习生|Engineer|Developer))/,
  ];
  for (const re of patterns) {
    const m = combined.match(re);
    if (m?.[1]) {
      const cleaned = m[1].trim().replace(/[。，,；;]+$/, "");
      if (cleaned.length >= 2) return cleaned.slice(0, 80);
    }
  }
  return "待确认岗位";
}

function classifyEvent(
  subject: string,
  text: string,
): { kind: EventKind; stageName: string; actionHint: EmailParseResult["actionHint"] } {
  const sample = `${subject}\n${text.slice(0, 800)}`;
  if (/录用通知|正式\s*offer|offer\s*(?:letter|通知|发放)|恭喜您通过.*全部面试/i.test(sample)) {
    return { kind: "offer", stageName: "正式offer", actionHint: "offer" };
  }
  if (/很遗憾|未能通过|暂不匹配|不匹配|感谢信|不再推进|unfortunately|not moving forward|regret to inform/i.test(sample)) {
    return { kind: "other", stageName: "流程终止", actionHint: "fail" };
  }
  if (/笔试|在线编程|coding\s*test|hackerrank|赛码|牛客笔试|oa\b/i.test(sample)) {
    return { kind: "written_test", stageName: "笔试", actionHint: "schedule" };
  }
  if (/测评|性格测试|行测|北森测评|shl|online\s*assessment/i.test(sample)) {
    return { kind: "assessment", stageName: "测评", actionHint: "schedule" };
  }
  if (/hr\s*面|人力.*面|人事面/i.test(sample)) {
    return { kind: "interview", stageName: "HR面", actionHint: "schedule" };
  }
  if (/四面|终面|总监面|vp面|final\s*(?:round|interview)/i.test(sample)) {
    return { kind: "interview", stageName: "三面", actionHint: "schedule" };
  }
  if (/三面|第三轮|round\s*3|third\s*round/i.test(sample)) {
    return { kind: "interview", stageName: "三面", actionHint: "schedule" };
  }
  if (/二面|第二轮|复试|round\s*2|second\s*round/i.test(sample)) {
    return { kind: "interview", stageName: "二面", actionHint: "schedule" };
  }
  if (/一面|初试|第一轮|技术面|视频面试|电话面试|现场面试|面试邀请|面试通知|面试安排|interview/i.test(sample)) {
    return { kind: "interview", stageName: "一面", actionHint: "schedule" };
  }
  return { kind: "other", stageName: "投递", actionHint: "applied" };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildIsoWithOffset(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }
  const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+08:00`;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function adjustHour(hour: number, period?: string): number {
  if (!period) return hour;
  const p = period.toLowerCase();
  if ((p === "下午" || p === "晚上" || p === "晚" || p === "pm") && hour >= 1 && hour <= 11) {
    return hour + 12;
  }
  if (p === "中午" && hour >= 1 && hour <= 3) {
    return hour + 12;
  }
  if (p === "am" && hour === 12) return 0;
  return hour;
}

function extractDateTimeRange(
  text: string,
  refDate: Date,
): { startAt?: string; endAt?: string } {
  const refYear = refDate.getFullYear();

  // Pattern 1: 2026年11月25日 (周三) 下午 14:30 - 15:30
  const cnFull = text.match(
    /(?:(20\d{2})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?\s*(?:[（(][^）)]{1,8}[）)])?\s*(上午|下午|晚上|中午|AM|PM)?\s*(\d{1,2})\s*[:：点时]\s*(\d{2})(?:\s*(?:[-~～至到])\s*(上午|下午|晚上|AM|PM)?\s*(\d{1,2})\s*[:：点时]\s*(\d{2}))?/i,
  );
  if (cnFull) {
    const month = Number(cnFull[2]);
    const day = Number(cnFull[3]);
    let year = cnFull[1] ? Number(cnFull[1]) : refYear;
    if (!cnFull[1] && month < refDate.getMonth() + 1 - 6) {
      year += 1;
    }
    const startH = adjustHour(Number(cnFull[5]), cnFull[4]);
    const startM = Number(cnFull[6]);
    const startAt = buildIsoWithOffset(year, month, day, startH, startM);
    let endAt: string | undefined;
    if (cnFull[8] && cnFull[9]) {
      const endH = adjustHour(Number(cnFull[8]), cnFull[7] || cnFull[4]);
      const endM = Number(cnFull[9]);
      endAt = buildIsoWithOffset(year, month, day, endH, endM);
    } else if (startAt) {
      endAt = new Date(Date.parse(startAt) + 60 * 60_000).toISOString();
    }
    if (startAt) return { startAt, endAt };
  }

  // Pattern 2: English date like Nov 25, 2026 14:30 or 25 Nov 2026 2:30 PM
  const enMonths: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const enMatch = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})?\s*(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
  );
  if (enMatch) {
    const month = enMonths[enMatch[1].slice(0, 3).toLowerCase()];
    const day = Number(enMatch[2]);
    const year = enMatch[3] ? Number(enMatch[3]) : refYear;
    const hour = adjustHour(Number(enMatch[4]), enMatch[6]);
    const minute = Number(enMatch[5]);
    const startAt = buildIsoWithOffset(year, month, day, hour, minute);
    if (startAt) {
      return { startAt, endAt: new Date(Date.parse(startAt) + 60 * 60_000).toISOString() };
    }
  }

  return {};
}

function extractLocationOrLink(text: string): string | undefined {
  const urls = text.match(/https?:\/\/[^\s"'<>）)】，,。]+/gi) || [];
  const preferred = urls.find((u) =>
    /meeting\.tencent|wemeet|vc\.feishu|zoom\.us|teams\.microsoft|meet\.google|nowcoder|acmcoder|beisen|mokahr|hackerrank|leetcode|interview|exam|test/i.test(
      u,
    ),
  );
  if (preferred) {
    const clean = sanitizeExternalUrl(preferred.replace(/[.,;!?]+$/, ""));
    if (clean) return clean;
  }

  const meetingNo = text.match(/(?:会议号|腾讯会议|飞书会议号|Meeting ID)\s*[:：]?\s*([0-9\- ]{9,16})/i);
  if (meetingNo?.[1]) {
    return `会议号 ${meetingNo[1].trim()}`;
  }

  const addr = text.match(/(?:面试地点|面试地址|地点|地址)\s*[:：]\s*([^\n\r]{4,60})/);
  if (addr?.[1]) {
    return addr[1].trim();
  }

  return undefined;
}

export function parseRecruitmentEmailByRules(input: RawEmailInput): EmailParseResult {
  const subject = (input.subject || "").trim();
  const from = (input.from || "").trim();
  const text = (input.text || "").replace(/\r\n/g, "\n").trim();
  const refDate = input.date ? new Date(input.date) : new Date();
  const safeRefDate = Number.isNaN(refDate.getTime()) ? new Date() : refDate;
  const snippet = text.replace(/\s+/g, " ").slice(0, 180);

  if (NEGATIVE_SUBJECT_HINTS.test(subject) && !RECRUIT_STRONG_KEYWORDS.test(subject)) {
    return {
      matched: false,
      confidence: 0,
      company: "",
      position: "",
      stageName: "",
      title: "",
      kind: "other",
      actionHint: "applied",
      snippet,
      reason: "非求职通知邮件（验证码/账单/广告）",
    };
  }

  let score = 0;
  if (RECRUIT_PLATFORM_HINTS.test(from)) score += 35;
  if (RECRUIT_STRONG_KEYWORDS.test(subject)) score += 50;
  if (RECRUIT_STRONG_KEYWORDS.test(text.slice(0, 1000))) score += 35;
  if (RECRUIT_SOFT_KEYWORDS.test(subject)) score += 20;
  if (RECRUIT_SOFT_KEYWORDS.test(text.slice(0, 800))) score += 15;

  const { startAt, endAt } = extractDateTimeRange(`${subject}\n${text.slice(0, 2000)}`, safeRefDate);
  const location = extractLocationOrLink(text.slice(0, 3000));
  if (startAt) score += 15;
  if (location) score += 10;

  if (score < 45) {
    return {
      matched: false,
      confidence: Math.min(score, 44),
      company: "",
      position: "",
      stageName: "",
      title: "",
      kind: "other",
      actionHint: "applied",
      snippet,
      reason: "未检测到明确的面试/笔试/求职进度特征",
    };
  }

  const company = extractCompany(subject, from, text);
  const position = extractPosition(subject, text);
  const { kind, stageName, actionHint } = classifyEvent(subject, text);
  const title =
    position !== "待确认岗位"
      ? `${company} ${position} ${stageName}`
      : `${company} ${stageName}`;

  return {
    matched: true,
    confidence: Math.min(100, score),
    company,
    position,
    stageName,
    title,
    kind,
    actionHint,
    startAt,
    endAt,
    location,
    snippet,
  };
}

export async function parseRecruitmentEmail(
  input: RawEmailInput,
  llm?: LlmEnhancerConfig | null,
): Promise<EmailParseResult> {
  const base = parseRecruitmentEmailByRules(input);
  if (!llm || !llm.baseUrl || !llm.apiKey || !llm.model) {
    return base;
  }
  if (!base.matched && base.confidence < 25) {
    return base;
  }

  try {
    const endpoint = `${llm.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llm.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: llm.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                '你是求职邮件结构化解析器。仅返回 JSON：{"matched":boolean,"company":string,"position":string,"stageName":string,"kind":"interview"|"written_test"|"assessment"|"offer"|"other","actionHint":"schedule"|"pass"|"fail"|"offer"|"applied","startAt":string|null,"endAt":string|null,"location":string|null}。时间使用 ISO-8601（带 +08:00 或 Z），非求职邮件 matched 为 false。',
            },
            {
              role: "user",
              content: `发件人: ${input.from}\n主题: ${input.subject}\n时间参考: ${new Date(input.date || Date.now()).toISOString()}\n正文:\n${input.text.slice(0, 2400)}`,
            },
          ],
        }),
      });
      if (!resp.ok) return base;
      const json = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const rawContent = json.choices?.[0]?.message?.content;
      if (!rawContent) return base;
      const parsed = JSON.parse(rawContent) as Partial<EmailParseResult>;
      if (parsed.matched === false) {
        return { ...base, matched: false, confidence: 0 };
      }
      const company = (parsed.company || "").trim() || base.company;
      const position = (parsed.position || "").trim() || base.position;
      const stageName = (parsed.stageName || "").trim() || base.stageName;
      const startAt =
        parsed.startAt && !Number.isNaN(Date.parse(parsed.startAt))
          ? new Date(parsed.startAt).toISOString()
          : base.startAt;
      const endAt =
        parsed.endAt && !Number.isNaN(Date.parse(parsed.endAt))
          ? new Date(parsed.endAt).toISOString()
          : base.endAt;
      return {
        ...base,
        matched: true,
        confidence: Math.max(base.confidence, 92),
        company,
        position,
        stageName,
        kind: parsed.kind || base.kind,
        actionHint: parsed.actionHint || base.actionHint,
        startAt,
        endAt,
        location: parsed.location || base.location,
        title: position !== "待确认岗位" ? `${company} ${position} ${stageName}` : `${company} ${stageName}`,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return base;
  }
}
