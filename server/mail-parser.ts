import {
  isGenericCompanyOrSender,
  matchBrandEntry,
  matchCompanyByEmailAddress,
  normalizeCompanyName,
} from "../shared/companies.js";
import { extractJsonValue } from "../shared/import-parser.js";
import type { EmailParseResult, EventKind, EventTimeMode } from "../shared/types.js";
import { callOpenAiCompatibleJson } from "./llm-client.js";
import { tryParseSpecializedTemplate } from "./mail-templates.js";
import { sanitizeExternalUrl } from "./security.js";

export interface RawEmailInput {
  subject: string;
  from: string;
  text: string;
  html?: string;
  icsText?: string;
  date?: Date | string;
}

export interface LlmEnhancerConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ParsedIcsEvent {
  startAt?: string;
  endAt?: string;
  summary?: string;
  location?: string;
  description?: string;
}

const RECRUIT_PLATFORM_HINTS =
  /beisen|mokahr|nowcoder|acmcoder|feishu|larksuite|bytedance\.net|lagou|zhipin|liepin|zhaopin|greenhouse|lever\.co|workday|ashbyhq|icims|smartrecruiters|eztest|talovative|shl|italent|hrms|hire\.|recruit|careers|hr@|talent@|campus|people@/i;

const NEGATIVE_SUBJECT_HINTS =
  /验证码|登录提醒|登录异常|账单|发票|快递|订单|会员|优惠券|广告|退订|密码重置|安全提醒|账户安全|日历提醒|verification code|\botp\b|invoice|receipt|newsletter|security alert|password reset|pull request|commit/i;

const SURVEY_FEEDBACK_RE =
  /面试体验调研|面试体验如何|面试满意度|满意度评价|满意度反馈|反馈今天的面试体验|体验调研|候选人调研|用户调研|体验问卷|反馈问卷|面试体验反馈|【[^】]{0,12}面试体验】|邀请您对面试.{0,12}评价|网申助手|interview-satisfaction|interview\s*experience\s*survey|candidate\s*(?:experience\s*)?survey|feedback\s*survey/i;

const PROMO_SUBJECT_RE =
  /持续招聘中|正在热招|热招岗位|专场直播|直播来袭|直播开聊|预约直播|宣讲会|空中宣讲|实战训练营|训练营|校招启动|校园招聘正式启动|校园招聘启动|招聘正式启动|已正式启动|校招网申|邀请你参加.{0,12}(?:校招|秋招|春招)|直通.{0,8}(?:终面|offer)|火热进行中|招聘火热|秋招开启|春招开启|秋招开放日|智联推荐|官方内推通道|内推码|职位推荐|岗位推荐|每周职位|高薪诚聘|直播间|岗位名称优化的说明|精英挑战赛|AI\s*大赛|证书培训|政府现金补贴|（AD）|\(AD\)/i;

const PROMO_BODY_STRONG_RE =
  /以下职位持续热招|专场直播|直播开聊|预约直播|福袋送不停|实战训练营|现邀请你参加.{0,12}校招网申|此次仅为名称和分类的优化/i;

const BOOKING_RECEIPT_RE =
  /您已经选择时间成功|您已提交成功面试时间|如进入面试环节，您将收到面试确认邮件/;

const PURE_RECEIPT_SUBJECT_RE =
  /^(?:(?:【[^】]{1,24}】|\[[^\]]{1,24}\])\s*)*(?:欢迎投递|感谢(?:您|你)?投递|投递成功|简历投递成功|简历成功投递|简历已收到|投递反馈|.*简历(?:投递成功|成功投递|已收到)|取消机考通知|取消面试通知)|(?:【[^】]{1,24}】\s*(?:投递成功|投递反馈|简历投递成功|简历成功投递))/i;

const EXPERT_PLATFORM_RE =
  /智囊团|experthub|专家平台|专家任务|专家合同|入驻平台|实名信息审核|教育经历信息】?驳回/i;

const STRONG_REJECTION_RE =
  /结果为\s*[:：]?\s*未通过|未能通过|暂未匹配|暂不匹配|与(?:招聘的)?岗位不匹配|很遗憾地?(?:通知|告知|终止)|不得不遗憾地?(?:通知|告知)|遗憾地?(?:通知|告知|终止)|投递流程已结束|招聘流程已结束|校招投递流程已结束|终止您?本次.{0,48}招聘流程|不再推进|停止推进|感谢信|未能进入下一环节|暂未能进入|无法进入下一阶段|决定不再继续|unfortunately.{0,40}(?:not|unable|will not)|not moving forward|will not be moving forward|regret to inform|decided not to proceed|pursue other candidates/i;

const SOFT_REJECTION_SUBJECT_RE = /感谢投递|感谢您应聘|感谢应聘|应聘反馈|简历评估结果|申请结果/i;
const SOFT_REJECTION_BODY_CUES = /人才库|未通过|遗憾|不匹配|流程已结束|终止.*流程|暂未通过|未能匹配/i;

const RECRUIT_STRONG_KEYWORDS =
  /面试邀请|面试通知|面试安排|面试提醒|面试变更|面试报名|预约面试|可面试时间|在线初评|初评邀请|AI\s*面试|笔试通知|笔试邀请|在线笔试|在线考试|笔试提醒|在线测评|线上测评|测评邀请|测评通知|人才测评|人才测试|素质能力评估|能力评估|能力测评|素质测评|性格测试|录用通知|录用意向书|录用意向|意向征询|实习留用|留用邀请|留用通知|转正意向|正式\s*offer|offer\s*(?:letter|通知|发放)|谈薪|视频面试|电话面试|现场面试|线下面试|interview\s*(?:invitation|schedule|reminder|confirmation)|online\s*(?:assessment|test|exam)|coding\s*(?:test|challenge)|technical\s*interview|offer\s*letter/i;

const RECRUIT_SOFT_KEYWORDS =
  /招聘|校招|社招|春招|秋招|实习生|投递|简历|一面|二面|三面|终面|hr面|笔试|测评|初评|考试|面试官|候选人|candidate|recruiting|recruitment|application/i;

const BAD_URL_EXT_RE = /\.(?:png|jpe?g|gif|svg|webp|ico|bmp|css|js|woff2?|ttf|eot)(?:$|\?|#)/i;
const EXCLUDED_URL_RE =
  /unsubscribe|optout|opt-out|candidatefeedback|speedtest\.cn|sctrack\.sendcloud\.net|dm-cn\.aliyuncs\.com\/trace|mp\.weixin\.qq\.com|\/download(?:$|\/|\?)|sass-download|(?:^https?:\/\/)?cdn\.|exam-status\?attendStatus=|exam_feedback\/(?:accept|reject)|feedbackResult\.html|reject-reason-page|precautions\.html|interview-satisfaction|nowcoder\.com\/discuss\//i;

const ICS_PLACEHOLDER_LOC_RE =
  /^(?:以邮件正文为准|详见邮件(?:正文)?|见邮件(?:正文)?|线上|在线|线上面试|视频面试|远程|远程面试|待定|无|tbd|online)$/i;

const BOGUS_POSITION_RE =
  /^(?:(?:20)?\d{2}届?(?:秋招|春招|校招|社招|校园招聘|社会招聘|实习招聘)?|校园招聘|社会招聘|校招|社招|秋招|春招|实习招聘|待确认岗位|多个|不限|通用|全部|未知|无|暂无|面试|笔试|测评|在线笔试|在线测评|在线考试|第\d+次在线笔试|视频面试|现场面试|电话面试|调整面试时间|详见正文|应聘岗位|投递岗位|relative|absolute|fixed|static|inherit|initial|block|inline|flex|none|auto|OPPO校招|联想校招实习生项目)$/i;

const CANONICAL_STAGES = [
  "一面",
  "二面",
  "三面",
  "终面",
  "HR面",
  "面试",
  "笔试",
  "测评",
  "录用意向",
  "正式Offer",
] as const;

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    });
}

export function htmlToCleanText(html: string): string {
  if (!html) return "";
  const stripped = html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // 先剥掉巨型内联 base64 图片和普通 <img>，避免截断时污染正文或把 CSS 漏进文本
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<img\b[\s\S]*$/gi, " ")
    .replace(/data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=\s]+/gi, " ");

  const withLinks = stripped.replace(
    /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, rawUrl: string, innerHtml: string) => {
      const url = decodeHtmlEntities(rawUrl).trim();
      const inner = decodeHtmlEntities(innerHtml.replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (BAD_URL_EXT_RE.test(url)) return inner ? ` ${inner} ` : " ";
      if (!inner || inner === url) return ` ${url} `;
      return ` ${inner} (${url}) `;
    },
  );

  const structured = withLinks
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|section|article|blockquote)>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    // 清理末尾被截断的未闭合 HTML 标签（如 <div style="position:relative;...）
    .replace(/<[a-z!/][^>]*$/i, " ");

  return decodeHtmlEntities(structured)
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/^(?:\|\s*)+$/gm, "")
    .replace(/\s*\|\s*(?:\|\s*)+/g, " | ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripNoiseLinesAndImageUrls(text: string): string {
  return text
    // 剥掉纯文本邮件里自动转出的 Banner/二维码图片链接与追踪像素链接
    .replace(/\[https?:\/\/[^\]]+\.(?:png|jpe?g|gif|webp|svg|bmp)(?:\?[^\]]*)?\]/gi, "")
    .replace(/\[https?:\/\/(?:dm-cn\.aliyuncs\.com\/trace|mp\.weixin\.qq\.com\/cgi-bin\/showqrcode)[^\]]*\]/gi, "")
    .replace(/^\s*(?:email|邀请函|校招(?:在线)?(?:测评|笔试)通知(?:候选人)?邮件模板)\s*$/gim, "")
    .replace(/^\s*\|\s*此邮件由系统发出[^|\n]*\|?\s*$/gm, "")
    .replace(/^\s*\|\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildCleanSnippet(cleanText: string, preferredParts: string[] = []): string {
  const usable = preferredParts
    .map((p) => p.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 2);
  if (usable.length > 0) {
    return usable.join(" ｜ ").slice(0, 180);
  }
  const body = stripNoiseLinesAndImageUrls(cleanText)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return body.slice(0, 180);
}

export function extractCleanEmailText(input: { text?: string; html?: string }): string {
  const rawText = (input.text || "").trim();
  const rawHtml = (input.html || "").trim();

  const looksLikeHtml = (s: string) => /<(?:html|head|body|style|table|div|p|br|tr|td|img)\b/i.test(s);

  const cleanFromHtml = rawHtml ? stripNoiseLinesAndImageUrls(htmlToCleanText(rawHtml)) : "";
  const cleanFromText = rawText
    ? stripNoiseLinesAndImageUrls(
        looksLikeHtml(rawText)
          ? htmlToCleanText(rawText)
          : decodeHtmlEntities(rawText)
              .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
              .replace(/\u00A0/g, " ")
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n")
              .replace(/[ \t]+\n/g, "\n")
              .replace(/\n{3,}/g, "\n\n")
              .trim(),
      )
    : "";

  if (!cleanFromText || cleanFromText.length < 30) {
    return cleanFromHtml || cleanFromText;
  }

  // If plain text exists but lacks actionable URLs present in HTML (common in ATS templates), prefer HTML clean text
  if (cleanFromHtml) {
    const textUrls = (cleanFromText.match(/https?:\/\/\S+/gi) || []).filter(
      (u) => !BAD_URL_EXT_RE.test(u) && !EXCLUDED_URL_RE.test(u),
    );
    const htmlUrls = (cleanFromHtml.match(/https?:\/\/\S+/gi) || []).filter(
      (u) => !BAD_URL_EXT_RE.test(u) && !EXCLUDED_URL_RE.test(u),
    );
    if (textUrls.length === 0 && htmlUrls.length > 0) {
      return cleanFromHtml;
    }
  }
  return cleanFromText;
}

function parseIcsDateValue(rawVal: string, tzid?: string): string | undefined {
  const val = rawVal.trim();
  // YYYYMMDDTHHMMSSZ (UTC)
  const utcMatch = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i);
  if (utcMatch) {
    const iso = `${utcMatch[1]}-${utcMatch[2]}-${utcMatch[3]}T${utcMatch[4]}:${utcMatch[5]}:${utcMatch[6]}Z`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
  }
  // YYYYMMDDTHHMMSS (local / TZID, default Asia/Shanghai +08:00)
  const localMatch = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/i);
  if (localMatch) {
    const offset = tzid && /utc|gmt/i.test(tzid) && !/[+-]\d/.test(tzid) ? "Z" : "+08:00";
    const iso = `${localMatch[1]}-${localMatch[2]}-${localMatch[3]}T${localMatch[4]}:${localMatch[5]}:${localMatch[6]}${offset}`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
  }
  // YYYYMMDD (all-day)
  const dateOnly = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const iso = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T09:00:00+08:00`;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
  }
  return undefined;
}

export function parseIcsEvent(icsText?: string): ParsedIcsEvent | null {
  if (!icsText || !/BEGIN:VEVENT/i.test(icsText)) return null;
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const veventMatch = unfolded.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i);
  if (!veventMatch) return null;
  const block = veventMatch[1];

  const getProp = (name: string): { value: string; params: string } | null => {
    const re = new RegExp(`^${name}(;[^:]*)?:(.*)$`, "im");
    const m = block.match(re);
    if (!m) return null;
    return { params: m[1] || "", value: m[2].trim() };
  };

  const dtStart = getProp("DTSTART");
  const dtEnd = getProp("DTEND");
  const summary = getProp("SUMMARY");
  const location = getProp("LOCATION");
  const description = getProp("DESCRIPTION");

  const extractTzid = (params: string) => {
    const m = params.match(/TZID=([^;:]+)/i);
    return m?.[1];
  };

  const unescapeIcs = (s?: string) =>
    s
      ?.replace(/\\n/gi, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\")
      .trim();

  const startAt = dtStart ? parseIcsDateValue(dtStart.value, extractTzid(dtStart.params)) : undefined;
  const endAt = dtEnd ? parseIcsDateValue(dtEnd.value, extractTzid(dtEnd.params)) : undefined;
  if (!startAt && !summary && !location) return null;

  return {
    startAt,
    endAt,
    summary: unescapeIcs(summary?.value),
    location: unescapeIcs(location?.value),
    description: unescapeIcs(description?.value),
  };
}

function isRejectionEmail(subject: string, cleanText: string): boolean {
  const head = cleanText.slice(0, 1600);
  const combined = `${subject}\n${head}`;
  if (STRONG_REJECTION_RE.test(combined)) {
    // Guard: if subject is clearly a positive offer/interview/exam invite, double-check that rejection phrase is not an unrelated footnote
    const strongPositiveSubj =
      /面试邀请|面试通知|面试提醒|笔试邀请|笔试通知|在线考试|测评邀请|录用意向|录用通知|offer/i.test(
        subject,
      );
    if (!strongPositiveSubj) return true;
    // Even with positive subject, reject if opening 400 chars explicitly state termination
    if (/结果为\s*[:：]?\s*未通过|投递流程已结束|招聘流程已结束|遗憾地?终止/i.test(cleanText.slice(0, 400))) {
      return true;
    }
  }
  if (SOFT_REJECTION_SUBJECT_RE.test(subject) && SOFT_REJECTION_BODY_CUES.test(head)) {
    return true;
  }
  return false;
}

function isSurveyEmail(subject: string, cleanText: string): boolean {
  if (SURVEY_FEEDBACK_RE.test(subject)) return true;
  const opening = cleanText.slice(0, 260);
  if (
    SURVEY_FEEDBACK_RE.test(opening) &&
    !/面试邀请|面试提醒|视频面试|笔试邀请|在线考试|测评邀请|录用意向|录用通知/i.test(subject)
  ) {
    return true;
  }
  return false;
}

function isPromoOrLivestreamEmail(subject: string, cleanText: string): boolean {
  const hasPersonalInviteSubj =
    /面试邀请|面试通知|面试安排|面试提醒|面试变更|面试报名|预约面试|在线初评|初评邀请|AI\s*面试|笔试邀请|笔试通知|笔试提醒|在线笔试|在线考试|专业笔试|技术笔试|测评邀请|测评通知|在线测评|综合能力测评|素质能力评估|素质测评|人才测评|能力测评|录用意向|录用通知|offer\s*(?:letter|通知)/i.test(
      subject,
    );
  if (hasPersonalInviteSubj) return false;
  if (PROMO_SUBJECT_RE.test(subject)) return true;
  if (PROMO_BODY_STRONG_RE.test(cleanText.slice(0, 600))) return true;
  return false;
}

function extractCompany(subject: string, from: string, cleanText: string): string {
  // 1. Explicit subject brackets: 【华为公司】 / [字节跳动] (skipping venue tags like 【上海场】 or generic tags)
  const bracketMatches = [...subject.matchAll(/[【\[]([^】\]]{2,36})[】\]]/g)];
  for (const m of bracketMatches) {
    const normalized = normalizeCompanyName(m[1]);
    if (normalized) return normalized;
  }

  // 2. Subject "来自 <Company> 的面试/笔试/测评/应聘/录用"
  const fromSubjectCue = subject.match(
    /来自\s*([^的，,。！!【\[\]]{2,32}?)\s*的(?:面试|笔试|在线|测评|应聘|录用|校招|社招|offer)/i,
  );
  if (fromSubjectCue?.[1]) {
    const normalized = normalizeCompanyName(fromSubjectCue[1]);
    if (normalized) return normalized;
  }

  // 3. Corporate email domain or ATS tenant localpart (checked BEFORE unbracketed subject prefix so "某人的面试邀请" from baidu.com resolves to 百度)
  const byAddr = matchCompanyByEmailAddress(from);
  if (byAddr) return byAddr;

  // 4. Subject leading "<Company> 2027届/校园招聘/人才测评/面试邀请/笔试邀请/录用意向书"
  const leadingSubj = subject.match(
    /^(?:(?:Re|Fwd|回复|转发)\s*[:：]\s*)?([^\s【\[\]（()）—\-–:：|]{2,24}?)\s*(?:20\d{2}届?|2\d届|校园招聘|社会招聘|校招|社招|秋招|春招|人才测评|素质能力|面试邀请|笔试邀请|测评邀请|在线笔试|在线考试|录用意向|录用通知|\|)/i,
  );
  if (leadingSubj?.[1]) {
    const normalized = normalizeCompanyName(leadingSubj[1]);
    if (normalized) return normalized;
  }

  // 5. Sender display name (skipping generic personas like 招聘小秘书 / iTalent招聘助手 / recruitment / HRMS)
  const fromNameMatch = from.match(/^"?([^"<@]{2,48})"?\s*</);
  if (fromNameMatch?.[1]) {
    const rawName = fromNameMatch[1].trim();
    if (!isGenericCompanyOrSender(rawName)) {
      const normalized = normalizeCompanyName(rawName);
      if (normalized) return normalized;
    }
  }

  // 6. Opening body cues
  const opening = cleanText.slice(0, 600);
  const bodyPatterns = [
    /(?:感谢参加|感谢您关注|感谢关注|诚邀您?参加|欢迎参加|已顺利通过|恭喜您?通过|关于)\s*([^\s，,。！!（(【\[「《]{2,24}?)\s*(?:的|20\d{2}|校园|社会|校招|社招|实习|「|在线|面试|笔试|测评)/,
    /([^\s，,。！!（(【\[]{2,20})诚邀您?参加/,
  ];
  for (const re of bodyPatterns) {
    const m = opening.match(re);
    if (m?.[1]) {
      const normalized = normalizeCompanyName(m[1]);
      if (normalized) return normalized;
    }
  }

  // 7. Brand catalog scan in subject then opening body
  const brandSubj = matchBrandEntry(subject);
  if (brandSubj) return brandSubj.name;
  const brandBody = matchBrandEntry(opening);
  if (brandBody) return brandBody.name;

  return "待确认公司";
}

export function cleanPosition(raw: string, company?: string): string {
  if (!raw) return "";
  let s = raw
    .replace(/[\r\n\t]+/g, " ")
    // 截断同行无换行粘连的后续邮件字段或操作提示（如华为 HTML 邮件的「AI技术应用 面试链接：...」）
    .replace(
      /\s*(?:【?(?:面试|笔试|测评|会议|预约|报到|签到|工作|投递|应聘|申请|联系)?(?:链接|地址|地点|时间|日期|环节|轮次|方式|形式|官|说明|提醒|须知|编号|密码|房间|入口|会议室|联系人|电话|邮箱|工具|准备|注意事项|备注|城市|部门)】?\s*[:：]|(?:进入面试|进入笔试|进入测评|点击(?:此|下方)?链接|确认参加|请提前|温馨提示|如涉及|https?:\/\/)).*$/i,
      "",
    )
    .replace(/^[\s"'「『《【\[:：\-—|]+/, "")
    .replace(/[\s"'」』》】\]。，,；;！!|]+$/, "")
    .replace(/^了\s+/, "")
    .replace(/^[（(]\s*(?:20)?\d{2}届?(?:秋招|春招|校招|社招|校园招聘|社会招聘|实习招聘)\s*[）)]\s*[-—–]?\s*/, "")
    .replace(/^(?:【[^】]{1,16}】|\[[^\]]{1,24}\])\s*/, "")
    .replace(/^[^【\[]*[】\]]\s*/, "")
    .replace(/^(?:20)?\d{2}届?(?:秋招|春招|校招|社招|校园招聘|社会招聘)\s*[-—–]\s*/, "")
    .replace(/(?:岗位|职位)(?:的(?:面试|笔试|测评|投递流程|招聘流程))?$/, "")
    .replace(/^(?:[^\s-]{2,14}(?:校园招聘|社会招聘|校招|社招))\s*[-—–]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (company && company !== "待确认公司") {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s
      .replace(new RegExp(`^${escaped}(?:集团|科技|公司)?\\s*(?:的|[-—–\\s])\\s*`, "i"), "")
      .trim();
  }

  // Balance dangling opening/closing parenthesis if truncated
  if (s.includes("（") && !s.includes("）")) {
    s = s.replace(/（[^）]*$/, "").trim();
  }
  if (s.includes("）") && !s.includes("（")) {
    s = s.replace(/^[^（]*）\s*/, "").trim();
  }
  if (s.includes("(") && !s.includes(")")) {
    s = s.replace(/\([^)]*$/, "").trim();
  }
  if (s.includes(")") && !s.includes("(")) {
    s = s.replace(/^[^(]*\)\s*/, "").trim();
  }

  if (s.length < 2 || s.length > 80) return "";
  if (BOGUS_POSITION_RE.test(s)) return "";
  if (/^https?:\/\//i.test(s)) return "";
  if (/^(?:点击|请|您好|亲爱的|尊敬的|感谢|关于|总量|的)/.test(s)) return "";
  if (/^(?:意向|目标|相关|对应|申请)$/.test(s)) return "";
  if (/无法进入|下一步|筛选流程|候选人|有限公司$|股份有限公司$|科技有限公司$|集团$|校园招聘$|社会招聘$/i.test(s)) {
    return "";
  }
  if (company && s.toLowerCase() === company.trim().toLowerCase()) return "";
  return s;
}

function extractPosition(subject: string, cleanText: string, company?: string): string {
  const head = cleanText.slice(0, 1800);
  const combined = `${subject}\n${head}`;

  const patterns: RegExp[] = [
    // 1. Bracketed or plain explicit labeled field (supports 【面试岗位】：xxx and table pipes)
    /【?(?:岗位名称|应聘职位|投递岗位|面试岗位|应聘岗位|职位名称|申请职位|投递职位|应聘方向|面试职位)】?\s*[:：]\s*(?:\|\s*)*([^\n\r|。；;]{2,72})/,
    // 2. Short label "职位：xxx" or "岗位：xxx"
    /(?:^|\n|\|\s*)【?(?:职位|岗位)】?\s*[:：]\s*(?:\|\s*)*([^\n\r|。；;]{2,64})/,
    // 3. Quoted role before 职位/岗位: 关于Shopee「（27届秋招）研发工程师-北京」职位的面试
    /[「『《【]([^」』》】\n\r]{2,60})[」』》】]\s*(?:职位|岗位)/,
    // 4. Subject dash after invite: 字节跳动校园招聘面试邀请/在线初评邀请 — AI Agent开发工程师 - 抖音平台产品
    /(?:面试邀请|在线初评邀请|初评邀请|笔试邀请|测评邀请|面试通知|笔试通知|面试提醒)\s*[—–\-:：]\s*([^\n\r]{2,76})/,
    // 5. Body "邀请您参加/就 xxx 岗位/职位"
    /(?:邀请您?(?:参加|就)|邀您参加)\s*([^\n\r，,。！!；;]{2,56}?)\s*(?:岗位|职位|的\s*(?:视频|现场|电话|在线)?(?:面试|笔试|测评))/,
    // 6. Body "感谢投递 <公司> <岗位> 职位/岗位" or "并投递 xxx 岗位"
    /(?:感谢投递|并投递|您投递|投递了)\s*(?:[^\s，,。]{2,16}(?:校园招聘|社会招聘|校招|社招|集团)?\s+)?([^\n\r，,。！!；;]{2,64}?)\s*(?:岗位|职位|，|,|。)/,
    // 7. Body "参加 <prefix>-<role> 岗位的面试"
    /参加\s*(?:[^\s，,。]{2,20}-)?([^\n\r，,。！!；;]{2,60}?)\s*(?:岗位|职位)的(?:面试|笔试|测评)/,
    // 8. English labels
    /(?:Position|Role|Job Title)\s*[:：]\s*([^\n\r|;]{2,64})/i,
    // 9. Subject role before 面试/笔试: 【字节跳动】后端开发工程师二面面试邀请
    /[】\]]\s*([^\n\r【】\[\]（()）]{2,36}?(?:工程师|开发|研发|算法|架构师|产品经理|设计师|测试|运维|实习生|科学家|研究员|Engineer|Developer))/,
    // 10. Dash + tech role (allowing trailing city/team suffix like （上海）)
    /[-—–]\s*([^\n\r【】\[\]（()）]{2,42}(?:工程师|开发|研发|算法|架构师|产品经理|设计师|测试|运维|实习生|Engineer|Developer)(?:\s*[（(][^）)]{1,16}[）)])?)/,
  ];

  for (const re of patterns) {
    const m = combined.match(re);
    if (m?.[1]) {
      const cleaned = cleanPosition(m[1], company);
      if (cleaned) return cleaned;
    }
  }
  return "";
}

export function normalizeStageName(raw: string | undefined, kind: EventKind): string {
  const s = (raw || "").trim();
  if (kind === "offer") {
    if (/意向|口头/i.test(s)) return "录用意向";
    return "正式Offer";
  }
  if (kind === "written_test") return "笔试";
  if (kind === "assessment") return "测评";
  if (kind === "interview") {
    if (/(?:hr\s*面(?:试)?|人力(?:资源)?面(?:试)?|人事面(?:试)?)/i.test(s)) return "HR面";
    if (/终面|四面|总监|主管面|业务主管面试|vp|final/i.test(s)) return "终面";
    if (/三面|第三轮|(?:专业|技术|业务|综合)面试\s*3(?![0-9:：月日点分])|round\s*3|third/i.test(s)) return "三面";
    if (/二面|第二轮|复试|(?:专业|技术|业务|综合)面试\s*2(?![0-9:：月日点分])|round\s*2|second/i.test(s)) return "二面";
    if (/一面|初试|第一轮|(?:专业|技术|业务|综合)面试\s*1(?![0-9:：月日点分])|round\s*1|first/i.test(s)) return "一面";
    return "面试";
  }
  if ((CANONICAL_STAGES as readonly string[]).includes(s)) return s;
  return "其他";
}

function classifyEvent(
  subject: string,
  cleanText: string,
): { kind: EventKind; stageName: string; actionHint: EmailParseResult["actionHint"] } {
  // 分类前先剥除正文里的 URL 与邮箱地址，杜绝 /interview/ 路径把笔试/测评污染成面试
  const head = cleanText
    .slice(0, 1200)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\w.+-]+@[\w.-]+/g, " ");
  const sample = `${subject}\n${head}`;

  // 1. Offer / Intent Letter (keep internship-retention keywords strictly subject-only so promo brochures never false-match)
  if (
    /录用意向书|录用意向|意向征询|口头\s*offer/i.test(sample) ||
    /实习留用|留用邀请|留用通知|转正意向/i.test(subject)
  ) {
    return { kind: "offer", stageName: "录用意向", actionHint: "offer" };
  }
  if (/录用通知|正式\s*offer|offer\s*(?:letter|通知|发放)|恭喜您通过.*全部面试/i.test(sample)) {
    return { kind: "offer", stageName: "正式Offer", actionHint: "offer" };
  }

  // 2. Subject-driven disambiguation first (prevents assessment/exam emails that mention "进入面试" in body from misclassifying)
  const detectInterviewRound = (text: string): string => {
    // 剔除「完成技术初试、技术复试和HR面试」这类罗列全流程的说明句，防止误标 HR面
    const filtered = text.replace(/(?:技术初试|初试)[、,，与和/].{0,24}(?:HR|人力)面试/gi, " ");
    if (/(?:hr\s*面(?:试)?|人力(?:资源)?面(?:试)?|人事面(?:试)?)/i.test(filtered)) return "HR面";
    if (/四面|终面|总监面|主管面|业务主管面试|vp\s*面|final\s*(?:round|interview)/i.test(filtered)) return "终面";
    if (/三面|第三轮|(?:专业|技术|业务|综合)面试\s*3(?![0-9:：月日点分])|round\s*3|third\s*round/i.test(filtered)) return "三面";
    if (/二面|第二轮|复试|(?:专业|技术|业务|综合)面试\s*2(?![0-9:：月日点分])|round\s*2|second\s*round/i.test(filtered)) return "二面";
    if (/一面|初试|第一轮|(?:专业|技术|业务|综合)面试\s*1(?![0-9:：月日点分])|round\s*1|first\s*round/i.test(filtered)) return "一面";
    return "面试";
  };

  if (/笔试|在线考试|在线编程|在线初评|初评邀请|AI\s*面试|coding\s*(?:test|challenge)|\boa\b/i.test(subject)) {
    return { kind: "written_test", stageName: "笔试", actionHint: "schedule" };
  }
  if (/测评|素质能力评估|能力评估|人才测试|性格测试|行测|online\s*assessment/i.test(subject)) {
    return { kind: "assessment", stageName: "测评", actionHint: "schedule" };
  }
  if (/面试|interview/i.test(subject)) {
    return {
      kind: "interview",
      stageName: detectInterviewRound(sample),
      actionHint: "schedule",
    };
  }

  // 3. Body classification fallback
  if (/笔试邀请|笔试通知|在线笔试|在线考试|在线初评|AI\s*能力测评|试卷名称|在线编程|coding\s*(?:test|challenge)|hackerrank|赛码|牛客笔试|\boa\b/i.test(head)) {
    return { kind: "written_test", stageName: "笔试", actionHint: "schedule" };
  }
  if (/在线测评|线上测评|测评邀请|测评通知|人才测评|人才测试|素质能力评估|能力评估|能力测评|素质测评|性格测试|行测|北森测评|shl|online\s*assessment|测评链接|测评网址/i.test(head)) {
    return { kind: "assessment", stageName: "测评", actionHint: "schedule" };
  }
  if (/面试邀请|面试通知|面试安排|面试提醒|视频面试|电话面试|现场面试|技术面|一面|二面|三面|终面|hr\s*面|interview/i.test(head)) {
    return {
      kind: "interview",
      stageName: detectInterviewRound(sample),
      actionHint: "schedule",
    };
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
  if (
    year < 2020 ||
    year > 2035 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
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

function inferYear(explicitYear: string | undefined, month: number, refDate: Date): number {
  if (explicitYear) return Number(explicitYear);
  let year = refDate.getFullYear();
  if (month < refDate.getMonth() + 1 - 6) year += 1;
  return year;
}

function extractDurationMinutes(text: string): number | undefined {
  const m = text.match(
    /(?:预计面试时长|考试时长|面试时长|笔试时长|初评时长|测评时长|答题时长|时长)\s*[:：]\s*(?:\|\s*)*约?\s*(\d{1,3}(?:\.\d+)?)\s*(分钟|小时|min|mins|minutes?|hours?|hrs?)/i,
  );
  if (!m) return undefined;
  const val = Number(m[1]);
  if (!Number.isFinite(val) || val <= 0 || val > 600) return undefined;
  const unit = m[2].toLowerCase();
  if (unit === "小时" || unit.startsWith("h")) return Math.round(val * 60);
  return Math.round(val);
}

function parseSingleCnDateTime(raw: string, refDate: Date): string | undefined {
  const m = raw.match(
    /(?:(20\d{2})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?\s*(?:[（(][^）)]{1,14}[）)])?\s*(?:星期[一二三四五六日天]|周[一二三四五六日天])?\s*(上午|下午|晚上|中午|AM|PM)?\s*(\d{1,2})\s*[:：点时]\s*(\d{2})(?::\d{2})?/i,
  );
  if (!m) return undefined;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const year = inferYear(m[1], month, refDate);
  const hour = adjustHour(Number(m[5]), m[4]);
  const minute = Number(m[6]);
  return buildIsoWithOffset(year, month, day, hour, minute);
}

function extractDateTimeRangeFromSnippet(
  snippet: string,
  refDate: Date,
  durationMin?: number,
): { startAt?: string; endAt?: string } {
  // Pattern 1: Chinese/ISO date + time + optional end time (supports Alibaba "2026年-09月-05日-14时-00分", --, -, ~, ～, 至, 到 and :ss seconds)
  const cnFull = snippet.match(
    /(?:(20\d{2})\s*[年\-/.]-?\s*)?(\d{1,2})\s*[月\-/.]-?\s*(\d{1,2})\s*日?-?\s*(?:[（(][^）)]{1,16}[）)])?\s*(?:星期[一二三四五六日天]|周[一二三四五六日天])?\s*(上午|下午|晚上|中午|AM|PM)?\s*(\d{1,2})\s*[:：点时]-?\s*(\d{2})\s*分?(?::\d{2})?(?:\s*(?:--|-|~|～|至|到)\s*(?:(?:20\d{2}\s*[年\-/.]-?\s*)?(\d{1,2})\s*[月\-/.]-?\s*(\d{1,2})\s*日?-?\s*)?(上午|下午|晚上|中午|AM|PM)?\s*(\d{1,2})\s*[:：点时]-?\s*(\d{2})\s*分?(?::\d{2})?)?/i,
  );
  if (cnFull) {
    const month = Number(cnFull[2]);
    const day = Number(cnFull[3]);
    const year = inferYear(cnFull[1], month, refDate);
    const startH = adjustHour(Number(cnFull[5]), cnFull[4]);
    const startM = Number(cnFull[6]);
    const startAt = buildIsoWithOffset(year, month, day, startH, startM);
    if (startAt) {
      let endAt: string | undefined;
      if (cnFull[10] && cnFull[11]) {
        const endMonth = cnFull[7] ? Number(cnFull[7]) : month;
        const endDay = cnFull[8] ? Number(cnFull[8]) : day;
        const endH = adjustHour(Number(cnFull[10]), cnFull[9] || cnFull[4]);
        const endM = Number(cnFull[11]);
        endAt = buildIsoWithOffset(year, endMonth, endDay, endH, endM);
      } else {
        endAt = new Date(Date.parse(startAt) + (durationMin || 60) * 60_000).toISOString();
      }
      return { startAt, endAt };
    }
  }

  // Pattern 2: English date like Nov 25, 2026 14:30 or Nov 25 2:30 PM
  const enMonths: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const enMatch = snippet.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(20\d{2})?\s*(?:at\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)?/i,
  );
  if (enMatch) {
    const month = enMonths[enMatch[1].slice(0, 3).toLowerCase()];
    const day = Number(enMatch[2]);
    const year = enMatch[3] ? Number(enMatch[3]) : refDate.getFullYear();
    const hour = adjustHour(Number(enMatch[4]), enMatch[6]);
    const minute = Number(enMatch[5]);
    const startAt = buildIsoWithOffset(year, month, day, hour, minute);
    if (startAt) {
      return {
        startAt,
        endAt: new Date(Date.parse(startAt) + (durationMin || 60) * 60_000).toISOString(),
      };
    }
  }
  return {};
}

function extractScheduleTime(
  subject: string,
  cleanText: string,
  kind: EventKind,
  refDate: Date,
  ics?: ParsedIcsEvent | null,
): { startAt?: string; endAt?: string; timeMode: EventTimeMode } {
  // 1. Authoritative ICS attachment
  if (ics?.startAt) {
    return {
      startAt: ics.startAt,
      endAt:
        ics.endAt ||
        new Date(Date.parse(ics.startAt) + 60 * 60_000).toISOString(),
      timeMode: "scheduled",
    };
  }

  const body = cleanText.slice(0, 2600);
  const durationMin = extractDurationMinutes(body);

  // 2. Multi-line Start / End time labels (e.g. Didi acmcoder)
  const startLabelMatch = body.match(
    /开始时间(?:\s*[（(][^）)]{1,20}[）)])?\s*[:：]\s*(?:\|\s*)*([^\n\r|]{6,60})/,
  );
  const endLabelMatch = body.match(
    /结束时间(?:\s*[（(][^）)]{1,20}[）)])?\s*[:：]\s*(?:\|\s*)*([^\n\r|]{6,60})/,
  );
  if (startLabelMatch?.[1]) {
    const startAt = parseSingleCnDateTime(startLabelMatch[1], refDate);
    if (startAt) {
      const endAt =
        (endLabelMatch?.[1] && parseSingleCnDateTime(endLabelMatch[1], refDate)) ||
        new Date(Date.parse(startAt) + (durationMin || 60) * 60_000).toISOString();
      return { startAt, endAt, timeMode: "scheduled" };
    }
  }

  // 2b. Separated Date + Time lines (e.g. Baidu: "面试日期: 2026-09-28 周一 \n 面试时间: 16:00")
  const sepDateMatch = body.match(
    /【?(?:面试日期|考试日期|笔试日期|日期)】?\s*[:：]\s*(?:\|\s*)*(?:(20\d{2})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/,
  );
  const sepClockMatch = body.match(
    /【?(?:面试时间|考试时间|笔试时间|签到时间|时间)】?\s*[:：]\s*(?:\|\s*)*(上午|下午|晚上|中午|AM|PM)?\s*(\d{1,2})\s*[:：点时]\s*(\d{2})(?:\s*(?:--|-|~|～|至|到)\s*(上午|下午|晚上|AM|PM)?\s*(\d{1,2})\s*[:：点时]\s*(\d{2}))?/i,
  );
  if (sepDateMatch && sepClockMatch) {
    const month = Number(sepDateMatch[2]);
    const day = Number(sepDateMatch[3]);
    const year = inferYear(sepDateMatch[1], month, refDate);
    const startH = adjustHour(Number(sepClockMatch[2]), sepClockMatch[1]);
    const startM = Number(sepClockMatch[3]);
    const startAt = buildIsoWithOffset(year, month, day, startH, startM);
    if (startAt) {
      let endAt: string | undefined;
      if (sepClockMatch[5] && sepClockMatch[6]) {
        const endH = adjustHour(Number(sepClockMatch[5]), sepClockMatch[4] || sepClockMatch[1]);
        const endM = Number(sepClockMatch[6]);
        endAt = buildIsoWithOffset(year, month, day, endH, endM);
      } else {
        endAt = new Date(Date.parse(startAt) + (durationMin || 60) * 60_000).toISOString();
      }
      return { startAt, endAt, timeMode: "scheduled" };
    }
  }

  // 3. Explicit scheduled time label (supports 【签到时间】：10月11日8:45 etc.)
  // 跨度超过 12 小时的开放作答区间（如多天有效窗口）自动转为截止时间 deadline
  const finalizeRange = (range: { startAt?: string; endAt?: string }): { startAt?: string; endAt?: string; timeMode: EventTimeMode } | null => {
    if (!range.startAt) return null;
    if (range.endAt) {
      const spanHours = (Date.parse(range.endAt) - Date.parse(range.startAt)) / 3600_000;
      if (spanHours > 12) {
        return { startAt: range.endAt, endAt: undefined, timeMode: "deadline" };
      }
    }
    return { ...range, timeMode: "scheduled" };
  };

  const labeledTimeRe =
    /【?(?:面试时间|考试时间|笔试时间|笔试开始时间|签到时间|测评时间|活动时间|预约时间|系统开放时间|开放时间|Time|Date)】?\s*[:：]?\s*(?:[（(\[][^）)\]]{1,24}[）)\]])?\s*(?:\|\s*)*([^\n\r]{6,90})/gi;
  for (const m of body.matchAll(labeledTimeRe)) {
    const line = m[1];
    if (/截止|有效期|失效|过期|前选择|前预约|之前完成/.test(line)) continue;
    if (!/\d{1,2}\s*[:：点时]\s*\d{2}/.test(line)) continue;
    const finalized = finalizeRange(extractDateTimeRangeFromSnippet(line, refDate, durationMin));
    if (finalized) return finalized;
  }

  // 4. Explicit deadline phrase — 对所有类型开放（含异步 AI 面试与限时预约面试，不再排除 interview！）
  const deadlinePatterns: RegExp[] = [
    /(?:有效期|截止(?:时间|日期)?)\s*[:：]\s*(?:请在\s*)?【?(20\d{2}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}\s*日?(?:\s*(?:星期[一二三四五六日天]|周[一二三四五六日天]))?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)】?/,
    /(?:有效期截至|截止至|截至)\s*「?[^「」\n\r]{0,20}?(20\d{2}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}\s*日?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)/,
    /(?:将于|于)\s*(20\d{2}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}\s*日?(?:\s*(?:星期[一二三四五六日天]|周[一二三四五六日天]))?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)\s*(?:失效|过期|截止)/,
    /(?:截止(?:时间|日期)?|截止至|截至|至|于|在)\s*(?:「[^」]{0,16}[（(])?【?(20\d{2}\s*[年\-/.]\s*\d{1,2}\s*[月\-/.]\s*\d{1,2}\s*日?(?:\s*\d{1,2}:\d{2}(?::\d{2})?)?)】?(?:[）)]」)?\s*(?:24:00)?\s*(?:前|之前|截止)/,
  ];
  for (const re of deadlinePatterns) {
    const dm = body.match(re);
    if (dm?.[1]) {
      const dateParts = dm[1].match(
        /(20\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})(?:\s*日)?(?:\s*(?:星期[一二三四五六日天]|周[一二三四五六日天]))?(?:\s*(\d{1,2}):(\d{2}))?/,
      );
      if (dateParts) {
        const year = Number(dateParts[1]);
        const month = Number(dateParts[2]);
        const day = Number(dateParts[3]);
        let hour = dateParts[4] ? Number(dateParts[4]) : 23;
        let minute = dateParts[5] ? Number(dateParts[5]) : 59;
        if (hour === 0 && minute === 0) {
          hour = 23;
          minute = 59;
        }
        const deadlineIso = buildIsoWithOffset(year, month, day, hour, minute);
        if (deadlineIso) {
          return { startAt: deadlineIso, endAt: undefined, timeMode: "deadline" };
        }
      }
    }
  }

  // 5. Relative validity window (同时扫主题与正文，容忍「72小时 内」「收到邮件 3天内」「于 两日内 完成」等空格变体)
  const cnNumMap: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  const relSample = `${subject}\n${body}`;
  const relDaysMatch =
    relSample.match(/有效期(?:为|内)?\s*(\d{1,2}|[一二两三四五六七八九十])\s*(?:个?(?:自然|工作)?[天日])/) ||
    relSample.match(/(?:请在|需在|收到.{0,10}(?:的|起)?|于|起)\s*(\d{1,2}|[一二两三四五六七八九十])\s*(?:个?(?:自然|工作)?[天日])\s*之?内\s*(?:点击|登录|进入|预约|选择|完成|作答|有效|失效|确认|回复)/) ||
    relSample.match(/(\d{1,2}|[一二两三四五六七八九十])\s*(?:个?(?:自然|工作)?[天日])\s*内\s*(?:有效|失效|完成|作答)/);
  if (relDaysMatch?.[1]) {
    const days = /^\d+$/.test(relDaysMatch[1]) ? Number(relDaysMatch[1]) : cnNumMap[relDaysMatch[1]] || 0;
    if (days >= 1 && days <= 30) {
      const target = new Date(refDate.getTime() + days * 86400_000);
      const deadlineIso = buildIsoWithOffset(
        target.getFullYear(),
        target.getMonth() + 1,
        target.getDate(),
        23,
        59,
      );
      if (deadlineIso) {
        return { startAt: deadlineIso, endAt: undefined, timeMode: "deadline" };
      }
    }
  }
  const relHoursMatch = relSample.match(
    /(?:请在|需在|建议您在|收到.{0,12}(?:后|的)?|于|在)\s*(\d{1,3})\s*小时\s*内\s*(?:预约|选择|确认|完成|作答|回复)/,
  );
  if (relHoursMatch?.[1]) {
    const hrs = Number(relHoursMatch[1]);
    if (hrs >= 1 && hrs <= 168) {
      return {
        startAt: new Date(refDate.getTime() + hrs * 3600_000).toISOString(),
        endAt: undefined,
        timeMode: "deadline",
      };
    }
  }

  // 6. Unlabeled date-time scan ONLY for interviews / written tests (avoids grabbing signature timestamps or deadline dates as scheduled!)
  if (kind === "interview" || kind === "written_test") {
    const snippetForScan = `${subject}\n${body.slice(0, 1400)}`;
    const range = extractDateTimeRangeFromSnippet(snippetForScan, refDate, durationMin);
    if (range.startAt) {
      const deltaMs = Math.abs(Date.parse(range.startAt) - refDate.getTime());
      if (deltaMs > 10 * 60_000) {
        if (/有效期|之前完成|逾期|自动失效|前选择|前预约|截止/.test(snippetForScan)) {
          return { startAt: range.endAt && (Date.parse(range.endAt) - Date.parse(range.startAt)) > 12 * 3600_000 ? range.endAt : range.startAt, endAt: undefined, timeMode: "deadline" };
        }
        const finalized = finalizeRange(range);
        if (finalized) return finalized;
      }
    }
  }

  return { startAt: undefined, endAt: undefined, timeMode: "flexible" };
}

function cleanExtractedUrl(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/[.,;!?）)\]】」》]+$/, "");
  if (BAD_URL_EXT_RE.test(trimmed) || EXCLUDED_URL_RE.test(trimmed)) return undefined;
  return sanitizeExternalUrl(trimmed) || undefined;
}

function scoreCandidateUrl(url: string): number {
  const lower = url.toLowerCase();
  if (BAD_URL_EXT_RE.test(lower) || EXCLUDED_URL_RE.test(lower)) return -100;
  let score = 0;
  if (/vc\.feishu|feishu\.cn\/vc|bytedance\.feishu|t\.zijieimg\.com|infoflow\.baidu\.com\/meeting|viewcoder\.qingque\.cn/.test(lower)) score += 95;
  if (/meeting\.tencent|wemeet|zoom\.us|teams\.microsoft|meet\.google|dingtalk\.com\/v/.test(lower)) score += 95;
  if (/jobs\.bytedance\.com\/interview\/|shixizhi\.huawei\.com\/iexam\/|career\.huawei\.com\/reccampportal\/interview\/interview\.html/.test(lower)) score += 95;
  if (/exam\.workatsea\.com|intv\.workatsea\.cn|interview\.antgroup\.com|campus-talent\.alibaba\.com\/(?:interview|personal)/.test(lower)) score += 92;
  if (/app\.mokahr\.com\/(?:su|candidate-appointment-interview)\/|exam\.nowcoder\.com\/(?:cts|ai-interview)|hr\.nowcoder\.com\/v1\/s\/|interview\.nowcoder\.com/.test(lower)) score += 90;
  if (/[a-z0-9-]+\.acmcoder\.com\/(?:cand|exam|login)/.test(lower)) score += 90;
  if (/eztest\.org|talovative\.com|ceping\.com|datatalk360\.com|shl\.com|beisen\.com|sdc\.qq\.com\/s\/|pt\.normstar\.net|oppo-tts\.i-select\.cn/.test(lower)) score += 88;
  if (/bsurl\.cn|ksurl\.cn|t\.zhaopin\.com|kuaishou\.cn\/recruit|iflytek\.com\/.*share\/page|interview|exam|assessment|test/.test(lower)) score += 62;
  if (/nowcoder\.com|acmcoder\.com|mokahr\.com|kuaishou\.com|joinus\.cc/.test(lower)) score += 35;
  // Penalize bare domain homepages like http://www.acmcoder.com
  try {
    const u = new URL(url);
    if (!u.pathname || u.pathname === "/") score -= 25;
  } catch {
    return -100;
  }
  return score;
}

function extractBestUrl(cleanText: string, preferredPatterns: RegExp[] = []): string | undefined {
  const sample = cleanText.slice(0, 4200);
  const rawUrls = sample.match(/https?:\/\/[^\s"'<>）)】，,。\]]+/gi) || [];
  const cleaned = rawUrls.map((u) => cleanExtractedUrl(u)).filter((u): u is string => Boolean(u));
  for (const pat of preferredPatterns) {
    const hit = cleaned.find((u) => pat.test(u));
    if (hit) return hit;
  }
  let bestUrl: string | undefined;
  let bestScore = 20;
  for (const u of cleaned) {
    const sc = scoreCandidateUrl(u);
    if (sc > bestScore) {
      bestScore = sc;
      bestUrl = u;
    }
  }
  return bestUrl;
}

function extractLocationOrLink(cleanText: string, ics?: ParsedIcsEvent | null): string | undefined {
  // 1. Check ICS location first, skipping generic placeholders like "以邮件正文为准"
  if (ics?.location) {
    const icsUrl = ics.location.match(/https?:\/\/[^\s"'<>）)】，,。]+/i);
    if (icsUrl?.[0]) {
      const clean = cleanExtractedUrl(icsUrl[0]);
      if (clean) return clean;
    }
    const locTrim = ics.location.trim();
    if (locTrim.length >= 4 && locTrim.length <= 120 && !ICS_PLACEHOLDER_LOC_RE.test(locTrim)) {
      return locTrim;
    }
  }

  const sample = cleanText.slice(0, 3800);

  // 2. Explicit labeled link field (generalized suffix patterns for 笔试/初评/测评/作答/考试/面试 链接/地址/入口)
  const labeledUrlRe =
    /(?:(?:面试|视频|视频面试|会议|入会|预约|考试|笔试|笔试考试|初评|复评|机考|实操|登录|测评|测试|答题|作答|意向书|确认|入场)(?:链接|地址|网址|路径|入口)|进入测评平台|马上开始测评|开始测试|复制到网页地址栏中|Meeting\s*Link|Interview\s*Link|Exam\s*Link|Assessment\s*Link)(?:\s*[（(][^）)]{1,28}[）)])?\s*[:：]?\s*(?:[^\n\r]{0,36}\(\s*)?(?:[\s|]{0,24})(https?:\/\/[^\s"'<>）)】，,。\]]+)/gi;
  for (const m of sample.matchAll(labeledUrlRe)) {
    const clean = cleanExtractedUrl(m[1]);
    if (clean) return clean;
  }

  // 3. Ranked URL scan across clean text
  const bestUrl = extractBestUrl(sample);
  if (bestUrl) return bestUrl;

  // 4. Meeting ID
  const meetingNo = sample.match(
    /(?:会议号|腾讯会议|飞书会议号|Meeting\s*ID)\s*[:：]?\s*(?:\|\s*)*([0-9\- ]{9,20})/i,
  );
  if (meetingNo?.[1]) {
    return `会议号 ${meetingNo[1].trim()}`;
  }

  // 5. Physical address (supports 【面试地点】：xxx)
  const addr = sample.match(/【?(?:面试地点|面试地址|现场地址)】?\s*[:：]\s*(?:\|\s*)*([^\n\r|]{4,72})/);
  if (addr?.[1] && !/^(?:视频面试|线上|线上面试)$/.test(addr[1].trim())) {
    return addr[1].trim();
  }

  return undefined;
}

export function buildEventTitle(company: string, position: string, stageName: string): string {
  const co = company.trim() || "待确认公司";
  const pos = cleanPosition(position);
  const st = stageName.trim() || "面试";
  const parts = pos ? [co, pos, st] : [co, st];
  return parts.join(" ").slice(0, 180);
}

export function parseRecruitmentEmailByRules(input: RawEmailInput): EmailParseResult {
  const subject = (input.subject || "").trim();
  const from = (input.from || "").trim();
  const cleanText = extractCleanEmailText({ text: input.text, html: input.html });
  const ics = parseIcsEvent(input.icsText);
  const refDate = input.date ? new Date(input.date) : new Date();
  const safeRefDate = Number.isNaN(refDate.getTime()) ? new Date() : refDate;
  const snippet = buildCleanSnippet(cleanText);

  const reject = (
    reason: string,
    confidence = 0,
    actionHint: EmailParseResult["actionHint"] = "applied",
  ): EmailParseResult => ({
    matched: false,
    confidence,
    company: "",
    position: "",
    stageName: actionHint === "fail" ? "流程终止" : "",
    title: "",
    kind: "other",
    actionHint,
    snippet,
    reason,
    parserSource: "rules",
  });

  // Gate 1: Non-recruitment noise (OTP / billing / calendar reminder / alerts)
  if (NEGATIVE_SUBJECT_HINTS.test(subject) && !RECRUIT_STRONG_KEYWORDS.test(subject)) {
    return reject("非求职通知邮件（验证码/账单/广告/系统提醒）", 0);
  }

  // Gate 2: Expert / freelance platform onboarding (non-job-application)
  if (EXPERT_PLATFORM_RE.test(`${subject}\n${cleanText.slice(0, 400)}`)) {
    return reject("专家平台或非求职招聘通知", 0);
  }

  // Gate 3: Interview survey / satisfaction questionnaire
  if (isSurveyEmail(subject, cleanText)) {
    return reject("面试体验调研或满意度问卷（非日程通知）", 0);
  }

  // Gate 4: Campus livestream / job promo / recruiting ads
  if (isPromoOrLivestreamEmail(subject, cleanText)) {
    return reject("校招宣传、直播或职位推荐邮件（非个人日程）", 0);
  }

  // Gate 5: Rejection / process terminated (explicitly excluded per policy)
  if (isRejectionEmail(subject, cleanText)) {
    return reject("识别为拒信或流程终止通知，已按规则忽略不写入日程", 0, "fail");
  }

  // Gate 5b: Pure application receipt / exam-cancellation / slot-submission receipt without confirmed schedule
  if (PURE_RECEIPT_SUBJECT_RE.test(subject) && !RECRUIT_STRONG_KEYWORDS.test(subject)) {
    return reject("仅为投递确认或取消回执，暂无待办日程", 0);
  }
  if (
    /预约面试成功/.test(subject) &&
    BOOKING_RECEIPT_RE.test(cleanText.slice(0, 400)) &&
    !/面试时间\s*[:：]/.test(cleanText)
  ) {
    return reject("仅为意向时间提交回执，请等待正式面试确认邮件", 0);
  }

  // Specialized Company / ATS High-Precision Templates Layer (runs BEFORE generic rules)
  const specialized = tryParseSpecializedTemplate(
    { subject, from, cleanText, refDate: safeRefDate, ics },
    {
      cleanPosition,
      buildEventTitle,
      normalizeStageName,
      buildCleanSnippet,
      extractBestUrl,
    },
  );
  if (specialized) {
    return specialized;
  }

  const { kind, stageName, actionHint } = classifyEvent(subject, cleanText);

  let score = 0;
  if (RECRUIT_PLATFORM_HINTS.test(from)) score += 30;
  if (RECRUIT_STRONG_KEYWORDS.test(subject)) score += 50;
  if (RECRUIT_STRONG_KEYWORDS.test(cleanText.slice(0, 1200))) score += 35;
  if (RECRUIT_SOFT_KEYWORDS.test(subject)) score += 20;
  if (RECRUIT_SOFT_KEYWORDS.test(cleanText.slice(0, 1000))) score += 15;
  if (ics?.startAt) score += 25;

  const { startAt, endAt, timeMode } = extractScheduleTime(
    subject,
    cleanText,
    kind,
    safeRefDate,
    ics,
  );
  const location = extractLocationOrLink(cleanText, ics);
  if (startAt) score += 15;
  if (location) score += 10;

  // Gate 6: Pure application confirmation or generic recruiting note with no interview/exam/assessment/offer
  if (kind === "other" || actionHint === "applied") {
    return reject("未检测到明确的面试、笔试、测评或 Offer 安排", Math.min(score, 30));
  }

  if (score < 45) {
    return reject("未检测到明确的面试、笔试、测评或 Offer 特征", Math.min(score, 44));
  }

  const company = extractCompany(subject, from, cleanText);
  const position = extractPosition(subject, cleanText, company);
  const title = buildEventTitle(company, position, stageName);

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
    timeMode,
    location,
    snippet,
    parserSource: "rules",
  };
}

function normalizeMailLlmPayload(
  parsed: Partial<EmailParseResult> & { timeMode?: EventTimeMode; reason?: string },
  base: EmailParseResult,
  options: { allowExternalFail?: boolean } = {},
): EmailParseResult {
  if (parsed.matched === false || parsed.actionHint === "fail") {
    return {
      ...base,
      matched: false,
      confidence: 0,
      actionHint: parsed.actionHint === "fail" ? "fail" : base.actionHint,
      parserSource: "llm",
      reason:
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim().slice(0, 120)
          : parsed.actionHint === "fail"
            ? "识别为拒信或流程终止通知，已按规则忽略不写入日程"
            : "大模型判定为非有效求职日程邮件",
    };
  }

  const kind: EventKind =
    parsed.kind === "interview" ||
    parsed.kind === "written_test" ||
    parsed.kind === "assessment" ||
    parsed.kind === "offer"
      ? parsed.kind
      : base.kind !== "other"
        ? base.kind
        : "interview";

  const rawCompany = typeof parsed.company === "string" ? parsed.company.trim() : "";
  const company =
    normalizeCompanyName(rawCompany) ||
    (base.company && base.company !== "待确认公司" ? base.company : "") ||
    rawCompany ||
    "待确认公司";

  const llmPos = cleanPosition(typeof parsed.position === "string" ? parsed.position : "", company);
  const position = llmPos || base.position || "";
  const stageName = normalizeStageName(
    typeof parsed.stageName === "string" ? parsed.stageName : base.stageName,
    kind,
  );

  const timeMode: EventTimeMode =
    parsed.timeMode === "scheduled" ||
    parsed.timeMode === "deadline" ||
    parsed.timeMode === "flexible"
      ? parsed.timeMode
      : parsed.startAt
        ? "scheduled"
        : base.timeMode || "flexible";

  let startAt: string | undefined;
  let endAt: string | undefined;
  if (timeMode === "flexible") {
    startAt = undefined;
    endAt = undefined;
  } else {
    startAt =
      typeof parsed.startAt === "string" && !Number.isNaN(Date.parse(parsed.startAt))
        ? new Date(parsed.startAt).toISOString()
        : base.startAt;
    if (timeMode === "deadline") {
      endAt = undefined;
    } else {
      endAt =
        typeof parsed.endAt === "string" && !Number.isNaN(Date.parse(parsed.endAt))
          ? new Date(parsed.endAt).toISOString()
          : base.endAt ||
            (startAt ? new Date(Date.parse(startAt) + 60 * 60_000).toISOString() : undefined);
    }
  }

  let location = base.location;
  if (typeof parsed.location === "string" && parsed.location.trim()) {
    const trimmedLoc = parsed.location.trim();
    if (/^https?:\/\//i.test(trimmedLoc)) {
      const validUrl = cleanExtractedUrl(trimmedLoc);
      if (validUrl) location = validUrl;
    } else if (trimmedLoc.length >= 3) {
      location = trimmedLoc;
    }
  }

  if (options.allowExternalFail && company === "待确认公司" && !position && !startAt && !location) {
    return {
      ...base,
      matched: false,
      confidence: 0,
      parserSource: "llm",
      reason: "贴入的 JSON 缺少公司、时间或链接等有效字段",
    };
  }

  return {
    ...base,
    matched: true,
    confidence: Math.max(base.confidence, 94),
    company,
    position,
    stageName,
    kind,
    actionHint: kind === "offer" ? "offer" : "schedule",
    startAt,
    endAt,
    timeMode,
    location,
    parserSource: "llm",
    title: buildEventTitle(company, position, stageName),
  };
}

function tryParseExternalMailJson(rawText: string): EmailParseResult | null {
  const trimmed = rawText.trim();
  const looksLikeJson =
    /^\s*(?:```(?:json)?\s*)?\{/i.test(trimmed) ||
    /"matched"\s*:\s*(?:true|false)/.test(trimmed);
  if (!looksLikeJson) return null;

  const val = extractJsonValue(trimmed);
  const blankBase: EmailParseResult = {
    matched: false,
    confidence: 0,
    company: "待确认公司",
    position: "",
    stageName: "面试",
    title: "",
    kind: "other",
    actionHint: "applied",
    snippet: trimmed.replace(/\s+/g, " ").slice(0, 180),
    parserSource: "llm",
  };

  if (!val || typeof val !== "object" || Array.isArray(val)) {
    return {
      ...blankBase,
      reason: "检测到贴入内容为 JSON，但格式不完整；请完整复制大模型输出的 JSON 对象。",
    };
  }

  const obj = val as Record<string, unknown>;
  if (
    typeof obj.matched !== "boolean" &&
    typeof obj.company !== "string" &&
    typeof obj.stageName !== "string"
  ) {
    return null;
  }

  const snippetParts = [
    typeof obj.company === "string" ? obj.company : "",
    typeof obj.position === "string" ? obj.position : "",
    typeof obj.stageName === "string" ? obj.stageName : "",
    typeof obj.location === "string" ? obj.location : "",
  ].filter(Boolean);
  blankBase.snippet = snippetParts.join(" ").slice(0, 180) || blankBase.snippet;

  return normalizeMailLlmPayload(
    obj as Partial<EmailParseResult> & { timeMode?: EventTimeMode; reason?: string },
    blankBase,
    { allowExternalFail: true },
  );
}

export async function parseRecruitmentEmail(
  input: RawEmailInput,
  llm?: LlmEnhancerConfig | null,
): Promise<EmailParseResult> {
  const directJson = tryParseExternalMailJson(input.text || "");
  if (directJson) {
    return directJson;
  }

  const base = parseRecruitmentEmailByRules(input);
  if (!llm || !llm.baseUrl || !llm.apiKey || !llm.model) {
    return base;
  }

  // Hard-rejected by policy (OTP/billing/survey/promo/rejection/expert platform) -> never waste tokens or override policy
  if (!base.matched && base.confidence === 0) {
    return base;
  }

  // Low-confidence non-recruitment -> skip LLM
  if (!base.matched && base.confidence < 15) {
    return base;
  }

  const cleanText = extractCleanEmailText({ text: input.text, html: input.html });
  const ics = parseIcsEvent(input.icsText);
  const refIso = new Date(input.date || Date.now()).toISOString();

  try {
    const llmRes = await callOpenAiCompatibleJson(
      llm,
      [
        {
          role: "system",
          content: `你是 OfferLine 求职日程邮件解析器。只提取需要候选人参加或处理的「面试、笔试、在线测评、Offer/录用意向」邮件，返回严格 JSON（不要代码块）：
{"matched":boolean,"company":string,"position":string,"stageName":"一面"|"二面"|"三面"|"终面"|"HR面"|"面试"|"笔试"|"测评"|"录用意向"|"正式Offer","kind":"interview"|"written_test"|"assessment"|"offer","actionHint":"schedule"|"offer"|"fail","timeMode":"scheduled"|"deadline"|"flexible","startAt":string|null,"endAt":string|null,"location":string|null}

严格规则：
1. 以下一律 matched=false：拒信/感谢信/流程终止、面试体验调研/满意度问卷、校招直播/宣讲/群发广告、单纯投递回执、专家平台签约、验证码/账单/系统通知。
2. company 必须写简洁常用品牌名（如"大疆""Shopee""字节跳动""华为""科大讯飞""去哪儿"），不要写法定全称或中英双语后缀。
3. position 只填邮件明确写出的具体岗位名；如果邮件根本没写岗位，必须填 ""，严禁填"2027届校园招聘""秋招"或"待确认岗位"。
4. stageName 只能从上述枚举中选；如果面试邮件没写明第几轮，必须填"面试"，严禁臆测"一面"。
5. timeMode：有明确面试/笔试时间点填"scheduled"；只有确认/完成截止日期或有效天数填"deadline"（startAt 填截止时间，endAt 填 null）；无具体时间也无截止日期填"flexible"（startAt 和 endAt 均填 null，绝不要填发件时间！）。
6. location 优先填真实会议链接、笔试登录链接、测评链接或意向书链接，严禁填图片 URL、下载客户端链接、公众号文章或退订链接。时间用 ISO-8601（带 +08:00 或 Z）。`,
        },
        {
          role: "user",
          content: `发件人: ${input.from}\n主题: ${input.subject}\n发件时间参考: ${refIso}${ics ? `\nICS日程附件: start=${ics.startAt || ""} end=${ics.endAt || ""} loc=${ics.location || ""}` : ""}\n正文:\n${cleanText.slice(0, 3200)}`,
        },
      ],
      { timeoutMs: 15_000 },
    );

    if (!llmRes.ok) return base;
    return normalizeMailLlmPayload(
      llmRes.data as Partial<EmailParseResult> & { timeMode?: EventTimeMode; reason?: string },
      base,
    );
  } catch {
    return base;
  }
}
