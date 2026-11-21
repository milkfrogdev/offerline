import { describe, expect, it } from "vitest";
import { parseRecruitmentEmailByRules } from "../server/mail-parser";
import { buildIcsCalendar } from "../server/ics";

describe("求职邮件规则解析与 ICS 生成", () => {
  it("精准解析中文大厂视频面试邀请（公司、岗位、轮次、时间、会议链接）", () => {
    const res = parseRecruitmentEmailByRules({
      subject: "【字节跳动】后端开发工程师二面面试邀请",
      from: "字节跳动校园招聘 <recruit@bytedance.com>",
      text: "您好！诚邀您参加字节跳动二面视频面试。\n应聘职位：基础架构后端开发工程师\n面试时间：2026年11月25日（周三）下午 2:30 - 3:30\n面试链接：https://vc.feishu.cn/j/123456789\n请提前 10 分钟进入会议室。",
      date: "2026-11-22T02:00:00Z",
    });

    expect(res.matched).toBe(true);
    expect(res.company).toBe("字节跳动");
    expect(res.position).toContain("后端开发");
    expect(res.stageName).toBe("二面");
    expect(res.kind).toBe("interview");
    expect(res.location).toBe("https://vc.feishu.cn/j/123456789");
    expect(res.startAt).toBe("2026-11-25T06:30:00.000Z");
    expect(res.endAt).toBe("2026-11-25T07:30:00.000Z");
  });

  it("解析牛客在线笔试通知", () => {
    const res = parseRecruitmentEmailByRules({
      subject: "【美团】2027届校招在线笔试通知",
      from: "牛客网 <noreply@nowcoder.com>",
      text: "您已通过美团简历初筛，请准时参加在线笔试。\n岗位：服务端开发\n时间：2026-11-28 19:00-21:00\n考试入口：https://www.nowcoder.com/test/998877",
      date: "2026-11-22T02:00:00Z",
    });

    expect(res.matched).toBe(true);
    expect(res.company).toBe("美团");
    expect(res.kind).toBe("written_test");
    expect(res.stageName).toBe("笔试");
    expect(res.location).toBe("https://www.nowcoder.com/test/998877");
  });

  it("屏蔽验证码、账单和广告等非求职邮件", () => {
    const res = parseRecruitmentEmailByRules({
      subject: "您的登录验证码为 839201",
      from: "安全中心 <security@example.com>",
      text: "您正在尝试登录账号，验证码 10 分钟内有效，请勿泄露。",
      date: "2026-11-22T02:00:00Z",
    });
    expect(res.matched).toBe(false);
  });

  it("生成标准 RFC 5545 ICS 日历并包含提前 30 分钟提醒", () => {
    const ics = buildIcsCalendar([
      {
        id: "ev-1",
        company: "腾讯",
        position: "后台开发",
        stageName: "一面",
        title: "腾讯 · 后台开发 一面",
        kind: "interview",
        startAt: "2026-11-25T06:30:00.000Z",
        endAt: "2026-11-25T07:30:00.000Z",
        location: "https://meeting.tencent.com/dm/abc",
        source: "email",
        status: "confirmed",
        syncedToRecord: false,
        createdAt: "2026-11-22T00:00:00.000Z",
        updatedAt: "2026-11-22T00:00:00.000Z",
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics).toContain("SUMMARY:腾讯 · 后台开发 一面");
    expect(ics).toContain("END:VCALENDAR");
  });
});
