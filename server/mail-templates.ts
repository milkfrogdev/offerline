import { normalizeCompanyName } from "../shared/companies.js";
import type { EmailParseResult, EventKind, EventTimeMode } from "../shared/types.js";
import { sanitizeExternalUrl } from "./security.js";

export interface TemplateContext {
  subject: string;
  from: string;
  cleanText: string;
  refDate: Date;
  ics?: {
    startAt?: string;
    endAt?: string;
    summary?: string;
    location?: string;
    description?: string;
  } | null;
}

export interface TemplateHelpers {
  cleanPosition: (raw: string, company?: string) => string;
  buildEventTitle: (company: string, position: string, stageName: string) => string;
  normalizeStageName: (raw: string | undefined, kind: EventKind) => string;
  buildCleanSnippet: (cleanText: string, preferredParts?: string[]) => string;
  extractBestUrl: (text: string, preferredPatterns?: RegExp[]) => string | undefined;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildIso(
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
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

function parseExactDateTime(raw: string, refDate: Date): string | undefined {
  const m = raw.match(
    /(?:(20\d{2})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?(?:\s*[（(][^）)]{1,12}[）)])?(?:\s*(?:星期[一二三四五六日天]|周[一二三四五六日天]))?\s*(上午|下午|晚上|中午|AM|PM)?\s*(\d{1,2})\s*[:：点时]\s*(\d{2})(?::\d{2})?/i,
  );
  if (!m) return undefined;
  const month = Number(m[2]);
  const day = Number(m[3]);
  let year = m[1] ? Number(m[1]) : refDate.getFullYear();
  if (!m[1] && month < refDate.getMonth() + 1 - 6) year += 1;
  let hour = Number(m[5]);
  const p = (m[4] || "").toLowerCase();
  if ((p === "下午" || p === "晚上" || p === "pm") && hour >= 1 && hour <= 11) hour += 12;
  if (p === "中午" && hour >= 1 && hour <= 3) hour += 12;
  if (p === "am" && hour === 12) hour = 0;
  return buildIso(year, month, day, hour, Number(m[6]));
}

function parseDateTimeRange(
  raw: string,
  refDate: Date,
  defaultDurMin = 60,
): { startAt?: string; endAt?: string; spanHours?: number } {
  const m = raw.match(
    /(?:(20\d{2})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?(?:\s*[（(][^）)]{1,14}[）)])?(?:\s*(?:星期[一二三四五六日天]|周[一二三四五六日天]))?\s*(\d{1,2})\s*[:：点时]\s*(\d{2})(?::\d{2})?(?:\s*(?:--|-|~|～|至|到)\s*(?:北京时间\s*)?(?:(?:(20\d{2})\s*[年\-/.]\s*)?(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?(?:\s*[（(][^）)]{1,14}[）)])?\s*)?(\d{1,2})\s*[:：点时]\s*(\d{2})(?::\d{2})?)?/i,
  );
  if (!m) return {};
  const month = Number(m[2]);
  const day = Number(m[3]);
  let year = m[1] ? Number(m[1]) : refDate.getFullYear();
  if (!m[1] && month < refDate.getMonth() + 1 - 6) year += 1;
  const startAt = buildIso(year, month, day, Number(m[4]), Number(m[5]));
  if (!startAt) return {};
  let endAt: string | undefined;
  if (m[9] && m[10]) {
    const endYear = m[6] ? Number(m[6]) : year;
    const endMonth = m[7] ? Number(m[7]) : month;
    const endDay = m[8] ? Number(m[8]) : day;
    endAt = buildIso(endYear, endMonth, endDay, Number(m[9]), Number(m[10]));
  } else {
    endAt = new Date(Date.parse(startAt) + defaultDurMin * 60_000).toISOString();
  }
  const spanHours = endAt ? (Date.parse(endAt) - Date.parse(startAt)) / 3600_000 : 1;
  return { startAt, endAt, spanHours };
}

function addRelativeDaysEnd(refDate: Date, days: number): string | undefined {
  const target = new Date(refDate.getTime() + days * 86400_000);
  const cst = new Date(target.getTime() + 8 * 3600_000);
  return buildIso(cst.getUTCFullYear(), cst.getUTCMonth() + 1, cst.getUTCDate(), 23, 59);
}

function cleanUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/[.,;!?）)\]】」》#]+$/, "");
  return sanitizeExternalUrl(trimmed) || undefined;
}

function extractKvLine(text: string, labelPattern: string): string {
  const re = new RegExp(`(?:^|\\n)\\s*(?:[*•·\\-\\d.、]+\\s*)?(?:${labelPattern})\\s*[:：]\\s*([^\\n\\r]{2,180})`, "i");
  const m = text.match(re);
  return m?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function cleanPaperPosition(rawPaper: string, company: string, h: TemplateHelpers): string {
  let s = rawPaper
    .replace(/^【[^】]{1,24}】\s*/, "")
    .replace(/^(?:20)?\d{2}届?(?:秋招|春招|校招|社招|校园招聘|社会招聘|暑期)?\s*[-—–]?\s*/, "")
    .replace(/(?:在线)?(?:笔试|测评|考试|初评|AI面试)(?:[（(]?\d{3,4}[）)]?|\d{4})?$/i, "")
    .replace(/[（(]\d{3,4}[）)]$/, "")
    .trim();
  return h.cleanPosition(s, company);
}

function joinNotes(parts: (string | undefined | false)[]): string | undefined {
  const clean = parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.replace(/\s+/g, " ").trim());
  if (clean.length === 0) return undefined;
  return clean.join("｜").slice(0, 260);
}

/**
 * 模板 1：字节跳动 People AI 在线初评邀请（在线问答 + AI 能力测评 / Trae Agent 实操）
 */
function parseByteDanceOnlineScreening(ctx: TemplateContext, h: TemplateHelpers): EmailParseResult | null {
  const isByte = /bytedance\.net|bytedance\.com|people_ai/i.test(ctx.from) || /字节跳动/.test(ctx.subject);
  if (!isByte) return null;
  if (!/在线初评|初评邀请|【初评信息】|AI\s*能力测评/i.test(`${ctx.subject}\n${ctx.cleanText.slice(0, 900)}`)) {
    return null;
  }

  const company = "字节跳动";
  // 完整保留「岗位 - 业务线」（如 Agent研发工程师 - 抖音用户增长）
  const subjPos = ctx.subject.match(/(?:在线初评|初评)(?:邀请|通知)\s*[—–\-:：]\s*(.+)$/)?.[1]?.trim();
  const bodyPos = ctx.cleanText.match(
    /参加字节跳动(?:校园招聘|社会招聘|校招|社招)?\s*[-—–]\s*([^\n\r。]{2,76}?)\s*岗位的在线初评/,
  )?.[1]?.trim();
  const position = h.cleanPosition(subjPos || bodyPos || "", company);

  const form = extractKvLine(ctx.cleanText, "初评形式");
  const duration = extractKvLine(ctx.cleanText, "初评时长");
  const content = extractKvLine(ctx.cleanText, "初评内容");
  const validity = extractKvLine(ctx.cleanText, "有效期");

  let startAt = parseExactDateTime(validity, ctx.refDate);
  if (!startAt) {
    const m = ctx.cleanText.match(/请在\s*(20\d{2}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*之前完成/);
    if (m?.[1]) startAt = parseExactDateTime(m[1], ctx.refDate);
  }
  const timeMode: EventTimeMode = startAt ? "deadline" : "flexible";

  const explicitLink = ctx.cleanText.match(/初评链接\s*[:：]\s*(https?:\/\/[^\s\]）)>]+)/i)?.[1];
  const location =
    cleanUrl(explicitLink) ||
    h.extractBestUrl(ctx.cleanText, [/jobs\.bytedance\.com\/interview\//i]);

  const antiCheat = /不可切换?屏幕|不可切屏/.test(ctx.cleanText) ? "电脑端 Chrome，不可切屏" : "";
  const notes = joinNotes([
    duration ? `在线初评（${duration}）` : "在线初评",
    form,
    content ? `内容：${content}` : "",
    antiCheat,
  ]);
  const snippet = h.buildCleanSnippet(ctx.cleanText, [
    position ? `岗位：${position}` : "",
    duration ? `时长：${duration}` : "",
    validity ? `有效期：${validity}` : "",
    form,
  ]);

  return {
    matched: true,
    confidence: 99,
    company,
    position,
    stageName: "笔试",
    title: h.buildEventTitle(company, position, "笔试"),
    kind: "written_test",
    actionHint: "schedule",
    startAt,
    endAt: undefined,
    timeMode,
    location,
    snippet,
    notes,
    parserSource: "rules",
    templateId: "bytedance-online-screening",
  };
}

/**
 * 模板 2：华为 iTalent（面试邀请函 / 在线笔试 / 在线测评）
 */
function parseHuaweiTemplate(ctx: TemplateContext, h: TemplateHelpers): EmailParseResult | null {
  if (!/@huawei\.com/i.test(ctx.from) && !/【华为公司】/.test(ctx.subject)) return null;
  if (/取消机考|取消面试|未通过|感谢信|遗憾/.test(`${ctx.subject}\n${ctx.cleanText.slice(0, 300)}`)) {
    return null;
  }

  const company = "华为";
  const text = ctx.cleanText;

  // 2a. 华为在线笔试（shixizhi.huawei.com）
  if (/在线笔试|线上考试|试卷名称/.test(`${ctx.subject}\n${text.slice(0, 800)}`)) {
    const paper = text.match(/试卷名称\s*[:：]\s*([^\n\r]{2,60})/)?.[1]?.trim() || "";
    const timeLine = text.match(/考试时间\s*[:：]\s*([^\n\r]{6,80})/)?.[1] || text;
    const durMatch = text.match(/考试时长\s*[:：]\s*(\d{2,3})\s*(?:min|分钟)/i);
    const durMin = durMatch ? Number(durMatch[1]) : 120;
    const range = parseDateTimeRange(timeLine, ctx.refDate, durMin);
    const location = h.extractBestUrl(text, [/shixizhi\.huawei\.com\/iexam\//i]);
    const dualCam = /双机位/.test(text) ? "双机位监控" : "";
    const notes = joinNotes([
      paper ? `试卷：${paper}` : "",
      durMatch ? `时长：${durMatch[1]} 分钟` : "",
      dualCam,
    ]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "笔试",
      title: h.buildEventTitle(company, "", "笔试"),
      kind: "written_test",
      actionHint: "schedule",
      startAt: range.startAt,
      endAt: range.endAt,
      timeMode: range.startAt ? "scheduled" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [paper ? `试卷：${paper}` : "", durMatch ? `时长 ${durMatch[1]} 分钟` : "", dualCam]),
      notes,
      parserSource: "rules",
      templateId: "huawei-exam",
    };
  }

  // 2b. 华为在线测评（eztest.org）
  if (/在线测评|综合测评|eztest\.org/i.test(`${ctx.subject}\n${text.slice(0, 600)}`)) {
    const dlMatch = text.match(/于\s*(20\d{2}-\d{1,2}-\d{1,2})(?:\s+(\d{1,2}:\d{2})(?::\d{2})?)?\s*之前/);
    let startAt: string | undefined;
    if (dlMatch?.[1]) {
      const [y, mo, d] = dlMatch[1].split("-").map(Number);
      const clock = dlMatch[2];
      if (clock && clock !== "00:00") {
        const [hh, mm] = clock.split(":").map(Number);
        startAt = buildIso(y, mo, d, hh, mm);
      } else {
        startAt = buildIso(y, mo, d, 23, 59);
      }
    }
    const location = h.extractBestUrl(text, [/eztest\.org/i]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "测评",
      title: h.buildEventTitle(company, "", "测评"),
      kind: "assessment",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, ["华为在线综合测评", dlMatch ? `${dlMatch[1]} 前完成` : "不限时尽早完成"]),
      notes: dlMatch ? `请在 ${dlMatch[1]} 前完成综合测评` : "不限固定时段，请找安静环境一次完成",
      parserSource: "rules",
      templateId: "huawei-assessment",
    };
  }

  // 2c. 华为面试邀请函（career.huawei.com）
  if (/面试邀请|面试环节\s*[:：]|面试职位\s*[:：]/.test(`${ctx.subject}\n${text.slice(0, 900)}`)) {
    const rawPos = text.match(/面试职位\s*[:：]\s*([^\n\r]{2,72})/)?.[1] || "";
    const position = h.cleanPosition(rawPos, company);
    const rawStage = text.match(/面试环节\s*[:：]\s*([^\s\n\r，,；;]{2,20})/)?.[1] || "";
    const stageName = h.normalizeStageName(rawStage, "interview");
    const mode = text.match(/面试方式\s*[:：]\s*([^\s\n\r，,；;]{2,16})/)?.[1] || "";
    const timeStr = text.match(/面试时间\s*[:：]\s*([^\n\r]{6,90})/)?.[1] || text;
    const range = parseDateTimeRange(timeStr, ctx.refDate, 60);
    const location = h.extractBestUrl(text, [/career\.huawei\.com\/reccampportal\/interview\/interview\.html/i, /career\.huawei\.com/i]);
    const dualCam = /双机位/.test(text) ? "如涉双机位，两部设备均用同一链接进入" : "";
    const notes = joinNotes([rawStage ? `环节：${rawStage}` : "", mode ? `方式：${mode}` : "", dualCam]);
    return {
      matched: true,
      confidence: 99,
      company,
      position,
      stageName,
      title: h.buildEventTitle(company, position, stageName),
      kind: "interview",
      actionHint: "schedule",
      startAt: range.startAt,
      endAt: range.endAt,
      timeMode: range.startAt ? "scheduled" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [rawStage, position, mode ? `方式：${mode}` : ""]),
      notes,
      parserSource: "rules",
      templateId: "huawei-interview",
    };
  }

  return null;
}

/**
 * 模板 3：牛客网笔试 & 牛客 AI 面试（拼多多 / 美团 / 百度 / 京东 / B站 / 大疆 / 携程 / 众安）
 */
function parseNowcoderTemplate(ctx: TemplateContext, h: TemplateHelpers): EmailParseResult | null {
  const isNowcoder =
    /nowcoder\.(?:net|com)/i.test(ctx.from) ||
    /(?:hr|exam)\.nowcoder\.com/i.test(ctx.cleanText);
  if (!isNowcoder) return null;
  // 跳过普通人工视频面试（interview.nowcoder.com），只特判笔试和 AI 面试
  if (/interview\.nowcoder\.com/i.test(ctx.cleanText) && !/ai-interview|试卷名称|考试地址|笔试/i.test(ctx.cleanText)) {
    return null;
  }

  const text = ctx.cleanText;
  const fromName = ctx.from.match(/^"?([^"<@]{2,40})"?\s*</)?.[1]?.trim() || "";
  const bodyCo =
    text.match(/(?:感谢投递|您投递的)\s*([^\s，,。！!（(【\[]{2,24})/)?.[1] ||
    ctx.subject.match(/[【\[]([^】\]]{2,24})[】\]]/)?.[1] ||
    ctx.subject.match(/^([^\s【\[]+?)(?:20\d{2}|校招|邀请|在线笔试)/)?.[1] ||
    "";
  const company =
    normalizeCompanyName(fromName) ||
    normalizeCompanyName(bodyCo) ||
    normalizeCompanyName(ctx.subject) ||
    "待确认公司";

  // 3a. 牛客 AI 面试（美团 / 携程 / 众安 等异步限时 AI 面试）
  if (/AI面试|AI视频面试|ai-interview|智能面试评估|智能技术评估/i.test(`${ctx.subject}\n${text.slice(0, 600)}`)) {
    const rawPos =
      text.match(/完成\s*([^\n\r，,。]{2,48}?)\s*岗的线上AI面试/)?.[1] ||
      text.match(/面试职位\s*[:：]\s*([^\n\r]{2,56})/)?.[1] ||
      text.match(/参与\s*\[[^\]]+\]([^\n\r，,。的]{2,36})\s*的【/)?.[1] ||
      "";
    const position = h.cleanPosition(rawPos, company);

    // 优先识别截止时刻或窗口结束时间
    let startAt: string | undefined;
    const explicitEnd =
      text.match(/\((\d{2}-\d{2}\s+\d{2}:\d{2})\)后截止/)?.[1] ||
      text.match(/至\s*(20\d{2}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})/)?.[1];
    if (explicitEnd) {
      startAt = parseExactDateTime(explicitEnd, ctx.refDate);
    } else {
      const relHrs = text.match(/(?:于|在)\s*(\d{1,3})\s*小时\s*内/)?.[1];
      if (relHrs) {
        startAt = new Date(ctx.refDate.getTime() + Number(relHrs) * 3600_000).toISOString();
      } else {
        const relDays = text.match(/(\d{1,2})\s*个?(?:自然|工作)?[天日]\s*内/)?.[1];
        if (relDays) startAt = addRelativeDaysEnd(ctx.refDate, Number(relDays));
      }
    }

    // 严格优先真正的作答/面试房间链接，绝不拿「点击确认是否参加」链接
    const roomExplicit = text.match(/(?:作答链接|面试链接)\s*[:：]\s*(?:点击链接进入面试\s*)?(https?:\/\/[^\s\]）)>]+)/i)?.[1];
    const location =
      cleanUrl(roomExplicit) ||
      h.extractBestUrl(text, [/exam\.nowcoder\.com\/ai-interview/i, /hr\.nowcoder\.com\/v1\/s\//i]);

    const dur = text.match(/答题时间预计\s*(\d{1,3}\s*分钟)/)?.[1];
    const wxHint = /使用[“"]微信[”"]打开/.test(text) ? "需微信打开链接" : "";
    const notes = joinNotes(["在线 AI 面试（限期内随时作答）", dur ? `预计 ${dur}` : "", wxHint]);

    return {
      matched: true,
      confidence: 98,
      company,
      position,
      stageName: "笔试",
      title: h.buildEventTitle(company, position, "笔试"),
      kind: "written_test",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [notes || "在线 AI 面试", position ? `岗位：${position}` : ""]),
      notes,
      parserSource: "rules",
      templateId: "nowcoder-ai-interview",
    };
  }

  // 3b. 牛客在线笔试（拼多多 / 美团 / 百度 / 京东 / B站 / 大疆 / 携程 / 众安）
  const paperName = extractKvLine(text, "试卷名称");
  const posFromBody =
    text.match(/投递[^，,。\n\r]{0,24}?[-—–－]\s*(?:\[[^\]]+\])?\s*([^\n\r，,。]{2,48}?)\s*(?:职位|岗位)/)?.[1] ||
    text.match(/并投递\s*([^\n\r，,。]{2,48}?)\s*岗位/)?.[1] ||
    text.match(/参加\s*(?:\[[^\]]+\])([^\n\r，,。]{2,42}?)\s*岗位/)?.[1] ||
    "";
  const position =
    h.cleanPosition(posFromBody, company) ||
    (paperName ? cleanPaperPosition(paperName, company, h) : "");

  const durStr = extractKvLine(text, "考试时长");
  const durMinMatch = durStr.match(/(\d{2,3})\s*分钟/);
  const durMin = durMinMatch ? Number(durMinMatch[1]) : 120;
  const qType = extractKvLine(text, "笔试题型");

  let startAt: string | undefined;
  let endAt: string | undefined;
  let timeMode: EventTimeMode = "flexible";

  // 优先看「考试时间」显式区间
  const examTimeLine = extractKvLine(text, "考试时间|笔试时间");
  if (examTimeLine) {
    const r = parseDateTimeRange(examTimeLine, ctx.refDate, durMin);
    if (r.startAt) {
      if (r.endAt && (r.spanHours || 0) > 12) {
        startAt = r.endAt;
        timeMode = "deadline";
      } else {
        startAt = r.startAt;
        endAt = r.endAt;
        timeMode = "scheduled";
      }
    }
  }
  // 其次看拆分的「考试开始时间 / 笔试开始时间是」+「考试结束时间 / 笔试结束时间是」（携程 / 众安等）
  if (!startAt) {
    const startLine = text.match(/(?:考试|笔试)开始时间(?:是)?\s*[:：]?\s*([^\n\r。]{8,76})/)?.[1];
    const endLine = text.match(/(?:考试|笔试)结束时间(?:是)?\s*[:：]?\s*([^\n\r。]{8,76})/)?.[1];
    if (startLine) {
      const s = parseExactDateTime(startLine, ctx.refDate);
      if (s) {
        const e =
          (endLine && parseExactDateTime(endLine, ctx.refDate)) ||
          new Date(Date.parse(s) + durMin * 60_000).toISOString();
        const spanH = (Date.parse(e) - Date.parse(s)) / 3600_000;
        if (spanH > 12) {
          startAt = e;
          timeMode = "deadline";
        } else {
          startAt = s;
          endAt = e;
          timeMode = "scheduled";
        }
      }
    }
  }
  // 其次看 ICS（如果是固定开考场次）
  if (!startAt && ctx.ics?.startAt) {
    const spanH = ctx.ics.endAt
      ? (Date.parse(ctx.ics.endAt) - Date.parse(ctx.ics.startAt)) / 3600_000
      : 2;
    if (spanH > 12 && ctx.ics.endAt) {
      startAt = ctx.ics.endAt;
      timeMode = "deadline";
    } else {
      startAt = ctx.ics.startAt;
      endAt = ctx.ics.endAt || new Date(Date.parse(startAt) + durMin * 60_000).toISOString();
      timeMode = "scheduled";
    }
  }
  // 再次看「作答有效期」（如 B站「收到笔试通知的3天内失效」、作业帮「收到邮件 3天内 完成」）
  if (!startAt) {
    const relDays = text.match(/(?:收到(?:笔试通知|邮件)的?|有效期(?:为|内)?)\s*(\d{1,2})\s*个?(?:自然|工作)?[天日]\s*内/)?.[1];
    if (relDays) {
      startAt = addRelativeDaysEnd(ctx.refDate, Number(relDays));
      timeMode = "deadline";
    }
  }

  // 精准抓取「考试地址 / 笔试链接」，绝不被 ICS "以邮件正文为准" 或「确认是否参加」链接劫持
  const addrExplicit = text.match(/(?:考试地址|笔试链接|笔试地址)\s*[:：]\s*(https?:\/\/[^\s\]）)>]+)/i)?.[1];
  const location =
    cleanUrl(addrExplicit) ||
    h.extractBestUrl(text, [/exam\.nowcoder\.com\/cts\//i, /hr\.nowcoder\.com\/v1\/s\//i]);

  const dualCam = /双机位/.test(text) ? "需双机位监控" : /全程开启摄像头/.test(text) ? "需全程开摄像头" : "";
  const notes = joinNotes([
    paperName ? `试卷：${paperName}` : "",
    durStr ? `时长：${durStr}` : "",
    qType ? `题型：${qType}` : "",
    dualCam,
  ]);

  return {
    matched: true,
    confidence: 98,
    company,
    position,
    stageName: "笔试",
    title: h.buildEventTitle(company, position, "笔试"),
    kind: "written_test",
    actionHint: "schedule",
    startAt,
    endAt,
    timeMode,
    location,
    snippet: h.buildCleanSnippet(text, [paperName ? `试卷：${paperName}` : "", durStr, qType, dualCam]),
    notes,
    parserSource: "rules",
    templateId: "nowcoder-exam",
  };
}

/**
 * 模板 4：快手（面试预约 / 确认面试邀请 / 测评 / 实习留用）
 */
function parseKuaishouTemplate(ctx: TemplateContext, h: TemplateHelpers): EmailParseResult | null {
  if (!/@kuaishou\.com/i.test(ctx.from)) return null;
  // 跳过入职材料驳回提醒 & 面试体验问卷
  if (/面试体验|驳回提醒|教育经历信息/.test(ctx.subject)) return null;

  const company = "快手";
  const text = ctx.cleanText;

  // 4a. 快手实习留用邀请（花括号格式：{部门} 现邀请你参加 {岗位} 的实习留用）
  if (/实习留用/.test(ctx.subject)) {
    const dept = text.match(/\{([^}]{2,32})\}\s*现邀请你参加/)?.[1] || "";
    const role = text.match(/现邀请你参加\s*\{([^}]{2,48})\}\s*的实习留用/)?.[1] || "";
    const position = h.cleanPosition(role && dept ? `${role} - ${dept}` : role, company);
    const relDays = text.match(/(?:请在(?:收到邮件起的?)?|收到邮件起的?)\s*(\d{1,2})\s*个?(?:自然|工作)?[天日]\s*内/)?.[1];
    const startAt = relDays ? addRelativeDaysEnd(ctx.refDate, Number(relDays)) : undefined;
    const location = h.extractBestUrl(text, [/campus\.kuaishou\.cn\/recruit\/campus\/e\//i]);
    return {
      matched: true,
      confidence: 98,
      company,
      position,
      stageName: "录用意向",
      title: h.buildEventTitle(company, position, "录用意向"),
      kind: "offer",
      actionHint: "offer",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [position ? `留用岗位：${position}` : "", relDays ? `${relDays} 个工作日内反馈意愿` : ""]),
      notes: joinNotes([dept ? `部门：${dept}` : "", relDays ? `请在 ${relDays} 个工作日内确认意愿并投递` : ""]),
      parserSource: "rules",
      templateId: "kuaishou-retention",
    };
  }

  // 4b. 快手面试时间预约邀请（请在 24 小时内选择）
  if (/预约你的面试时间|选择方便的面试时间/.test(`${ctx.subject}\n${text.slice(0, 350)}`)) {
    const rawPos = text.match(/面试职位\s*[:：]\s*([^\n\r]{2,72})/)?.[1] || "";
    const position = h.cleanPosition(rawPos.replace(/^【[^】]{1,12}】\s*/, ""), company);
    const hrsMatch = text.match(/(\d{1,3})\s*小时内(?:选择|完成选择)/);
    const startAt = hrsMatch
      ? new Date(ctx.refDate.getTime() + Number(hrsMatch[1]) * 3600_000).toISOString()
      : undefined;
    const location = h.extractBestUrl(text, [/ksurl\.cn\//i]);
    return {
      matched: true,
      confidence: 98,
      company,
      position,
      stageName: "面试",
      title: h.buildEventTitle(company, position, "面试"),
      kind: "interview",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [position ? `职位：${position}` : "", hrsMatch ? `请在 ${hrsMatch[1]} 小时内预约面试时间` : "请尽快预约面试时间"]),
      notes: hrsMatch ? `面试预约链接，请在 ${hrsMatch[1]} 小时内选择时段` : "请打开链接预约面试时段",
      parserSource: "rules",
      templateId: "kuaishou-booking",
    };
  }

  // 4c. 快手已排期面试邀请（viewcoder.qingque.cn）
  if (/面试邀请/.test(ctx.subject) && /面试时间\s*[:：]/.test(text)) {
    const rawPos =
      text.match(/诚邀你参加(?:20\d{2}[^-\n\r]{0,16}-)?(?:【[^】]{1,12}】)?([^\n\r，,。]{2,48}?)(?:职位)?的面试/)?.[1] ||
      "";
    const position = h.cleanPosition(rawPos, company);
    const mode = extractKvLine(text, "面试形式");
    const timeStr = extractKvLine(text, "面试时间");
    const range = parseDateTimeRange(timeStr, ctx.refDate, 60);
    const location = h.extractBestUrl(text, [/viewcoder\.qingque\.cn/i, /ksurl\.cn\//i]);
    return {
      matched: true,
      confidence: 98,
      company,
      position,
      stageName: "面试",
      title: h.buildEventTitle(company, position, "面试"),
      kind: "interview",
      actionHint: "schedule",
      startAt: range.startAt,
      endAt: range.endAt,
      timeMode: range.startAt ? "scheduled" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [position ? `职位：${position}` : "", mode ? `形式：${mode}` : "", timeStr]),
      notes: mode ? `形式：${mode}` : undefined,
      parserSource: "rules",
      templateId: "kuaishou-interview",
    };
  }

  return null;
}

/**
 * 模板 5：腾讯校招（面试邀请函 / 48小时综合素质测评）
 */
function parseTencentTemplate(ctx: TemplateContext, h: TemplateHelpers): EmailParseResult | null {
  if (!/@(?:ceping\.)?tencent\.com/i.test(ctx.from)) return null;
  const company = "腾讯";
  const text = ctx.cleanText;

  // 5a. 腾讯综合素质测评（ceping@ceping.tencent.com + sdc.qq.com）
  if (/综合素质测评|ceping\.tencent\.com/i.test(`${ctx.from}\n${ctx.subject}`)) {
    const hrs = `${ctx.subject}\n${text.slice(0, 400)}`.match(/(\d{1,3})\s*小时内/)?.[1];
    const startAt = hrs
      ? new Date(ctx.refDate.getTime() + Number(hrs) * 3600_000).toISOString()
      : undefined;
    const location = h.extractBestUrl(text, [/sdc\.qq\.com\/s\//i]);
    const phoneHint = text.match(/尾号为\s*(\d{4})\s*的手机/)?.[1];
    const notes = joinNotes([
      hrs ? `请在 ${hrs} 小时内完成（建议每项 30 分钟）` : "综合素质测评",
      "电脑端 Chrome，需全程开摄像头",
      phoneHint ? `尾号 ${phoneHint} 手机登录` : "",
    ]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "测评",
      title: h.buildEventTitle(company, "", "测评"),
      kind: "assessment",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [notes || "腾讯综合素质测评"]),
      notes,
      parserSource: "rules",
      templateId: "tencent-assessment",
    };
  }

  // 5b. 腾讯校招面试邀请函 / 邀请反馈（兼容「面试时间[北京时间]：(可选时间)\n2026-03-24 (周二) 21:00-22:00」跨行格式）
  if (/面试邀请/.test(ctx.subject) && /面试时间/.test(text)) {
    const pos = extractKvLine(text, "面试职位");
    const dept = extractKvLine(text, "面试部门");
    const position = h.cleanPosition(pos && dept ? `${pos} - ${dept}` : pos, company);
    const form = extractKvLine(text, "面试形式");
    const way = extractKvLine(text, "面试方式");
    const timeLine =
      text.match(/面试时间(?:\[[^\]]+\])?\s*[:：]\s*(?:[（(]可选时间[）)]\s*\n?\s*)?([^\n\r]{6,80})/)?.[1] || "";
    const range = parseDateTimeRange(timeLine, ctx.refDate, 60);
    const location = h.extractBestUrl(text, [/meeting\.tencent\.com\//i, /join\.qq\.com\/interview_reply\.html/i]);
    const confirmHint = /请及时反馈是否参与面试|24小时内完成确认/.test(text) ? "需在 24 小时内确认参加" : "";
    const notes = joinNotes([form ? `形式：${form}` : "", way ? `方式：${way}` : "", dept ? `部门：${dept}` : "", confirmHint]);
    return {
      matched: true,
      confidence: 99,
      company,
      position,
      stageName: "面试",
      title: h.buildEventTitle(company, position, "面试"),
      kind: "interview",
      actionHint: "schedule",
      startAt: range.startAt,
      endAt: range.endAt,
      timeMode: range.startAt ? "scheduled" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [position, timeLine, way ? `方式：${way}` : "", confirmHint]),
      notes,
      parserSource: "rules",
      templateId: "tencent-interview",
    };
  }

  return null;
}

/**
 * 模板 5.5：阿里巴巴校园招聘（在线笔试含试做链接防抢 / 在线人才测评截至日期）
 */
function parseAlibabaTemplate(ctx: TemplateContext, h: TemplateHelpers): EmailParseResult | null {
  if (!/@alibaba-inc\.com/i.test(ctx.from)) return null;
  const company = "阿里巴巴";
  const text = ctx.cleanText;

  // 5.5a. 阿里在线笔试（优先「登录链接」campus-talent.alibaba.com，不被正文「试做链接」nowcoder 劫持）
  if (/笔试/.test(ctx.subject)) {
    const startLine = extractKvLine(text, "笔试开始时间|考试时间|笔试时间");
    const durLine = extractKvLine(text, "考试时长");
    const durMinMatch = durLine.match(/(\d{2,3})(?:\/\d{2,3})?\s*分钟/);
    const durMin = durMinMatch ? Number(durMinMatch[1]) : 100;
    const range = startLine ? parseDateTimeRange(startLine, ctx.refDate, durMin) : {};
    if (!range.startAt) {
      const aliHyphen = text.match(/(20\d{2})年-(\d{1,2})月-(\d{1,2})日-(\d{1,2})时-(\d{2})分/);
      if (aliHyphen) {
        const s = buildIso(
          Number(aliHyphen[1]),
          Number(aliHyphen[2]),
          Number(aliHyphen[3]),
          Number(aliHyphen[4]),
          Number(aliHyphen[5]),
        );
        if (s) {
          range.startAt = s;
          range.endAt = new Date(Date.parse(s) + durMin * 60_000).toISOString();
        }
      }
    }
    const qType = extractKvLine(text, "考试题型");
    const loginExplicit = text.match(/登录链接\s*[:：]\s*(https?:\/\/[^\s\]）)>]+)/i)?.[1];
    const location =
      cleanUrl(loginExplicit) ||
      h.extractBestUrl(text, [/campus-talent\.alibaba\.com\/personal/i, /campus-talent\.alibaba\.com/i]);
    const notes = joinNotes([durLine ? `时长：${durLine}` : "", qType ? `题型：${qType}` : ""]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "笔试",
      title: h.buildEventTitle(company, "", "笔试"),
      kind: "written_test",
      actionHint: "schedule",
      startAt: range.startAt,
      endAt: range.endAt,
      timeMode: range.startAt ? "scheduled" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [startLine ? `开考：${startLine}` : "", durLine, qType]),
      notes,
      parserSource: "rules",
      templateId: "alibaba-exam",
    };
  }

  // 5.5b. 阿里在线人才测评（有效期截至 YYYY-MM-DD + datatalk360）
  if (/测评/.test(ctx.subject)) {
    const dlMatch = text.match(/有效期截至\s*(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    const startAt = dlMatch
      ? buildIso(Number(dlMatch[1]), Number(dlMatch[2]), Number(dlMatch[3]), 23, 59)
      : undefined;
    const dur = extractKvLine(text, "测评时长");
    const location = h.extractBestUrl(text, [/datatalk360\.com/i]);
    const notes = joinNotes([dur ? `时长：${dur}` : "", "仅限电脑 PC 端作答"]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "测评",
      title: h.buildEventTitle(company, "", "测评"),
      kind: "assessment",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, ["阿里巴巴在线人才测评", dur, dlMatch ? `截至 ${dlMatch[1]}-${dlMatch[2]}-${dlMatch[3]}` : ""]),
      notes,
      parserSource: "rules",
      templateId: "alibaba-assessment",
    };
  }

  return null;
}

/**
 * 模板 6：去哪儿飞书 AI 面试 / Shopee 笔试窗口 / 招银测评窗口 / 蚂蚁测评截止
 */
function parseWindowedExamTemplates(ctx: TemplateContext, h: TemplateHelpers): EmailParseResult | null {
  const text = ctx.cleanText;

  // 6a. 飞书招聘在线 AI 面试（如去哪儿：随来随面 + 跨天开始/结束时间）
  if (/mail\.hire\.feishu\.cn/i.test(ctx.from) && /AI面试/i.test(ctx.subject)) {
    const coRaw = ctx.subject.match(/[【\[]([^】\]]{2,20})[】\]]/)?.[1] || ctx.from;
    const company = normalizeCompanyName(coRaw) || "待确认公司";
    const endLine = extractKvLine(text, "结束时间");
    const startAt = endLine ? parseExactDateTime(endLine, ctx.refDate) : undefined;
    const location = h.extractBestUrl(text, [/t\.zijieimg\.com\//i]);
    const dur = text.match(/预计用时\s*([\d\-]+\s*分钟)/)?.[1];
    const dualCam = /二机位|双机位/.test(text) ? "开启双机位监控" : "";
    const notes = joinNotes(["在线 AI 面试（随来随面）", dur ? `预计 ${dur}` : "", dualCam]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "笔试",
      title: h.buildEventTitle(company, "", "笔试"),
      kind: "written_test",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [notes || "在线 AI 面试", endLine ? `截止：${endLine}` : ""]),
      notes,
      parserSource: "rules",
      templateId: "feishu-ai-interview",
    };
  }

  // 6b. Shopee 笔试（有效期内任选 120 分钟，workatsea.com）
  if (/shopee/i.test(`${ctx.from}\n${ctx.subject}`) && /笔试/.test(ctx.subject)) {
    const company = "Shopee";
    const rawPos = text.match(/参加\s*([^\n\r，,。]{2,56}?)\s*的\s*【?在线笔试】?/)?.[1] || "";
    const position = h.cleanPosition(rawPos, company);
    const valLine = extractKvLine(text, "笔试链接有效期|有效期");
    const range = parseDateTimeRange(valLine, ctx.refDate, 120);
    const startAt = range.endAt || range.startAt;
    const dur = extractKvLine(text, "笔试时长");
    const location = h.extractBestUrl(text, [/exam\.workatsea\.com/i]);
    const notes = joinNotes([dur ? `时长：${dur}` : "有效期内任选时段完成", /摄像头/.test(text) ? "需开摄像头（Chrome）" : ""]);
    return {
      matched: true,
      confidence: 98,
      company,
      position,
      stageName: "笔试",
      title: h.buildEventTitle(company, position, "笔试"),
      kind: "written_test",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, [position, valLine ? `有效期：${valLine}` : "", dur]),
      notes,
      parserSource: "rules",
      templateId: "shopee-exam",
    };
  }

  // 6c. 招银网络科技素质/技术测评（95555@message.cmbchina.com）
  if (/cmbchina\.com/i.test(ctx.from) && /测评/.test(ctx.subject)) {
    const company = "招银网络科技";
    const timeLine = text.match(/测评时间\s*[:：]\s*([^\n\r。]{6,90})/)?.[1] || "";
    const range = parseDateTimeRange(timeLine, ctx.refDate, 60);
    const isWindow = Boolean(range.endAt && (range.spanHours || 0) > 12);
    const location = h.extractBestUrl(text, [/cmbnt\.ceping\.com\/Login\/Elink/i, /ceping\.com/i]);
    const passport = text.match(/准考通行证号\s*[:：]\s*([A-Za-z0-9]+)/)?.[1];
    const isTech = /技术测评/.test(ctx.subject);
    const notes = joinNotes([
      isTech ? "招银技术测评（集中作答）" : "招银素质测评（能力+个性+心理）",
      passport ? `通行证号：${passport}` : "",
      /摄像头/.test(text) ? "电脑端 Chrome，全程摄像头监控" : "",
    ]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "测评",
      title: h.buildEventTitle(company, "", "测评"),
      kind: "assessment",
      actionHint: "schedule",
      startAt: isWindow ? range.endAt : range.startAt,
      endAt: isWindow ? undefined : range.endAt,
      timeMode: !range.startAt ? "flexible" : isWindow ? "deadline" : "scheduled",
      location,
      snippet: h.buildCleanSnippet(text, [notes || "招银网络科技测评", timeLine]),
      notes,
      parserSource: "rules",
      templateId: "cmbnt-assessment",
    };
  }

  // 6d. 蚂蚁集团在线测评（请在【YYYY-MM-DD HH:mm:ss】之前完成）
  if (/@antgroup\.com/i.test(ctx.from) && /人才测评|在线素质测评/.test(`${ctx.subject}\n${text.slice(0, 300)}`)) {
    const company = "蚂蚁集团";
    const dlMatch = text.match(/请在\s*【?(20\d{2}-\d{1,2}-\d{1,2})(?:\s+(\d{1,2}:\d{2})(?::\d{2})?)?】?\s*之前完成/);
    let startAt: string | undefined;
    if (dlMatch?.[1]) {
      const [y, mo, d] = dlMatch[1].split("-").map(Number);
      const clock = dlMatch[2];
      if (clock && clock !== "00:00") {
        const [hh, mm] = clock.split(":").map(Number);
        startAt = buildIso(y, mo, d, hh, mm);
      } else {
        startAt = buildIso(y, mo, d, 23, 59);
      }
    }
    const dur = extractKvLine(text, "测评时长");
    const location = h.extractBestUrl(text, [/antgroup\.ceping\.com/i]);
    const notes = joinNotes([dur ? `时长：${dur}` : "", /限制跳出页面/.test(text) ? "系统限制跳出页面，关闭聊天工具" : ""]);
    return {
      matched: true,
      confidence: 98,
      company,
      position: "",
      stageName: "测评",
      title: h.buildEventTitle(company, "", "测评"),
      kind: "assessment",
      actionHint: "schedule",
      startAt,
      endAt: undefined,
      timeMode: startAt ? "deadline" : "flexible",
      location,
      snippet: h.buildCleanSnippet(text, ["蚂蚁集团在线素质测评", dur, dlMatch ? `${dlMatch[1]} 前完成` : ""]),
      notes,
      parserSource: "rules",
      templateId: "ant-assessment",
    };
  }

  return null;
}

const SPECIALIZED_PARSERS = [
  parseByteDanceOnlineScreening,
  parseHuaweiTemplate,
  parseAlibabaTemplate,
  parseNowcoderTemplate,
  parseKuaishouTemplate,
  parseTencentTemplate,
  parseWindowedExamTemplates,
] as const;

export function tryParseSpecializedTemplate(
  ctx: TemplateContext,
  helpers: TemplateHelpers,
): EmailParseResult | null {
  for (const parser of SPECIALIZED_PARSERS) {
    const res = parser(ctx, helpers);
    if (res) return res;
  }
  return null;
}
