import { describe, expect, it } from "vitest";
import { normalizeCompanyName } from "../shared/companies";
import { buildInitialStages, createDefaultStageDrafts } from "../shared/stages";
import type { ApplicationRecord, ScheduleEvent } from "../shared/types";
import { buildIcsCalendar } from "../server/ics";
import {
  assertSafeLlmUrl,
  callOpenAiCompatibleJson,
  extractJsonObject,
  normalizeLlmEndpoint,
} from "../server/llm-client";
import {
  htmlToCleanText,
  parseIcsEvent,
  parseRecruitmentEmail,
  parseRecruitmentEmailByRules,
} from "../server/mail-parser";
import {
  findDuplicateEmailEvent,
  inferRecordForEmail,
  mergeDuplicateEvent,
} from "../server/mail-sync";

function makeRecord(overrides: Partial<ApplicationRecord>): ApplicationRecord {
  return {
    id: overrides.id || "rec-1",
    company: overrides.company || "华为",
    position: overrides.position || "存储引擎研发工程师",
    stages: overrides.stages || buildInitialStages(createDefaultStageDrafts()),
    status: overrides.status || "active",
    priority: "normal",
    pinned: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("求职邮件深度解析、去噪、归一化与 ICS 生成", () => {
  it("精准解析中文大厂视频面试邀请（公司、岗位、轮次、时间、会议链接）", () => {
    const res = parseRecruitmentEmailByRules({
      subject: "【字节跳动】后端开发工程师二面面试邀请",
      from: "字节跳动校园招聘 <recruit@bytedance.com>",
      text: "您好！诚邀您参加字节跳动二面视频面试。\n应聘职位：基础架构后端开发工程师\n面试时间：2026年11月25日（周三）下午 2:30 - 3:30\n面试链接：https://vc.feishu.cn/j/123456789\n请提前 10 分钟进入会议室。",
      date: "2026-11-22T02:00:00Z",
    });

    expect(res.matched).toBe(true);
    expect(res.company).toBe("字节跳动");
    expect(res.position).toBe("基础架构后端开发工程师");
    expect(res.stageName).toBe("二面");
    expect(res.kind).toBe("interview");
    expect(res.timeMode).toBe("scheduled");
    expect(res.location).toBe("https://vc.feishu.cn/j/123456789");
    expect(res.startAt).toBe("2026-11-25T06:30:00.000Z");
    expect(res.endAt).toBe("2026-11-25T07:30:00.000Z");
  });

  it("未写明轮次的面试邀请如实标为「面试」，不臆测为「一面」", () => {
    const res = parseRecruitmentEmailByRules({
      subject: "字节跳动校园招聘面试邀请 — AI 平台开发工程师 - 基础研发部",
      from: '"字节跳动 ByteDance" <people@mail.bytedance.net>',
      text: "",
      html: `<html><head><style>body{font-size:12px;}.wrap{padding:20px;}</style></head><body>
        <p>诚邀你参加面试。</p>
        <p>面试时间：2026-10-19 16:00(GMT+08:00)</p>
        <p>面试链接：<a href="https://t.zijieimg.com/mockRoom001/">点击进入视频面试</a></p>
        <p>客户端下载：<a href="https://www.feishu.cn/download">下载飞书</a></p>
        <p>面试结束后您将收到【面试体验调研】</p>
      </body></html>`,
      date: "2026-10-14T10:00:00Z",
    });

    expect(res.matched).toBe(true);
    expect(res.company).toBe("字节跳动");
    expect(res.position).toBe("AI 平台开发工程师 - 基础研发部");
    expect(res.stageName).toBe("面试");
    expect(res.location).toBe("https://t.zijieimg.com/mockRoom001/");
    expect(res.startAt).toBe("2026-10-19T08:00:00.000Z");
  });

  it("HTML 邮件含大段 <style> CSS 前缀时不被截断，并归一化法定全称与双横线时间", () => {
    const bigCss = `.box{margin:0;padding:0;}`.repeat(80);
    const res = parseRecruitmentEmailByRules({
      subject: "DJI 大疆 2027 校园招聘笔试邀请",
      from: '"深圳市大疆创新科技有限公司" <support@batchmail.nowcoder.net>',
      text: "",
      html: `<html><head><style>${bigCss}</style></head><body>
        <p>感谢您关注 DJI 大疆 2027 校园招聘并投递 后端开发工程师（深圳） 岗位，现诚邀您参加在线笔试。</p>
        <p><a href="https://hr.nowcoder.com/v1/s/confirm000">点击确认参加</a></p>
        <p>考试时间：(北京时间，UTC+08:00) 2026-10-15 19:00:00 -- 21:00:00</p>
        <p>考试地址：<a href="https://hr.nowcoder.com/v1/s/exam999">https://hr.nowcoder.com/v1/s/exam999</a></p>
      </body></html>`,
      date: "2026-10-13T10:00:00Z",
    });

    expect(res.matched).toBe(true);
    expect(res.company).toBe("大疆");
    expect(res.position).toBe("后端开发工程师（深圳）");
    expect(res.kind).toBe("written_test");
    expect(res.stageName).toBe("笔试");
    expect(res.startAt).toBe("2026-10-15T11:00:00.000Z");
    expect(res.endAt).toBe("2026-10-15T13:00:00.000Z");
    expect(res.location).toBe("https://hr.nowcoder.com/v1/s/exam999");
  });

  it("解析赛码多行起止时间 + 泛称发件人（招聘小秘书 / recruitment）还原真实公司", () => {
    const exam = parseRecruitmentEmailByRules({
      subject: "【滴滴】在线考试邀请函！",
      from: '"滴滴" <exam@test.acmcoder.com>',
      text: "非常高兴邀请您参加滴滴在线考试。\n登录路径：https://didi.acmcoder.com/cand/login?token=demo\n岗位名称：27届秋招-后端研发工程师-企业级事业部\n考试时长：100分钟\n开始时间（北京时间）：2026-10-11 10:00 星期日\n结束时间（北京时间）：2026-10-11 11:40 星期日",
      date: "2026-10-09T08:00:00Z",
    });
    expect(exam.matched).toBe(true);
    expect(exam.company).toBe("滴滴");
    expect(exam.position).toBe("后端研发工程师-企业级事业部");
    expect(exam.startAt).toBe("2026-10-11T02:00:00.000Z");
    expect(exam.endAt).toBe("2026-10-11T03:40:00.000Z");
    expect(exam.location).toBe("https://didi.acmcoder.com/cand/login?token=demo");

    const shopee = parseRecruitmentEmailByRules({
      subject: "来自Shopee的面试提醒",
      from: '"招聘小秘书" <shopee-no-reply@mail.mokahr.com>',
      text: "",
      html: `<table><tr><td>你有一场关于Shopee「（27届秋招）研发工程师-北京」职位的面试。</td></tr>
        <tr><td>面试时间：</td><td>2026-10-09 16:00</td></tr>
        <tr><td>预计面试时长：</td><td>60分钟</td></tr>
        <tr><td>面试链接：</td><td><a href="https://app.mokahr.com/su/demo123">点击入会</a></td></tr></table>`,
      date: "2026-10-09T06:00:00Z",
    });
    expect(shopee.matched).toBe(true);
    expect(shopee.company).toBe("Shopee");
    expect(shopee.position).toBe("研发工程师-北京");
    expect(shopee.location).toBe("https://app.mokahr.com/su/demo123");
  });

  it("区分录用意向书截止日期（deadline）与不限时在线测评（flexible），绝不编造岗位", () => {
    const intent = parseRecruitmentEmailByRules({
      subject: "科大讯飞2027届校园招聘录用意向书",
      from: "HRMS@iflytek.com",
      text: "您好！您已顺利通过科大讯飞2027届校园招聘面试！请在2026-10-23 00:00:00 24:00前确认接受。\n意向书链接：https://xinghanit.iflytek.com/share/page/demo\n科大讯飞人力资源部\n2026-10-16 09:47:41",
      date: "2026-10-16T01:47:41Z",
    });
    expect(intent.matched).toBe(true);
    expect(intent.company).toBe("科大讯飞");
    expect(intent.position).toBe("");
    expect(intent.kind).toBe("offer");
    expect(intent.stageName).toBe("录用意向");
    expect(intent.timeMode).toBe("deadline");
    expect(intent.endAt).toBeUndefined();
    expect(intent.location).toBe("https://xinghanit.iflytek.com/share/page/demo");

    const flexAssess = parseRecruitmentEmailByRules({
      subject: "【华为公司】诚邀您参加华为公司在线测评",
      from: "italentmailsys@huawei.com",
      text: "您好，请您重新完成华为公司在线测评，测试网址：https://eztest.org/exam/session/demo123 ，请找安静环境连续做完。",
      date: "2026-11-11T07:33:00Z",
    });
    expect(flexAssess.matched).toBe(true);
    expect(flexAssess.company).toBe("华为");
    expect(flexAssess.position).toBe("");
    expect(flexAssess.timeMode).toBe("flexible");
    expect(flexAssess.startAt).toBeUndefined();
    expect(flexAssess.location).toBe("https://eztest.org/exam/session/demo123");
  });

  it("覆盖盲测新增真实模式：分行日期时间、北森测评失效期、站点标签、纯投递回执防误杀与实习留用", () => {
    // 1. 分行 面试日期 + 面试时间 + 邮箱域名优先于“某人的面试邀请”
    const splitDt = parseRecruitmentEmailByRules({
      subject: "候选人的面试邀请",
      from: "talentsystem@baidu.com",
      text: "现邀请您就 北京-后端开发工程师 职位进行一次面试。\n面试日期: 2026-09-28 周一\n面试时间: 16:00\n面试链接:\nhttps://infoflow.baidu.com/meeting/invite?id=demo123",
      date: "2026-09-27T08:00:00Z",
    });
    expect(splitDt.matched).toBe(true);
    expect(splitDt.company).toBe("百度");
    expect(splitDt.position).toBe("北京-后端开发工程师");
    expect(splitDt.startAt).toBe("2026-09-28T08:00:00.000Z");
    expect(splitDt.location).toBe("https://infoflow.baidu.com/meeting/invite?id=demo123");

    // 2. 站点标签【上海场】不当公司名 + 【签到时间】/【面试岗位】
    const onsite = parseRecruitmentEmailByRules({
      subject: "科大讯飞2027届校园招聘【上海场】线下面试通知",
      from: '"智联招聘" <service@mail-transaction.wisdomore.com>',
      text: "【面试岗位】：Java开发工程师；\n【签到时间】：10月11日8:45；\n【面试地点】：上海某酒店3楼签到；",
      date: "2026-10-08T10:00:00Z",
    });
    expect(onsite.matched).toBe(true);
    expect(onsite.company).toBe("科大讯飞");
    expect(onsite.position).toBe("Java开发工程师");
    expect(onsite.startAt).toBe("2026-10-11T00:45:00.000Z");

    // 3. 北森/iTalent 泛称发件人 + 失效截止时间 + ceping.com 链接
    const beisen = parseRecruitmentEmailByRules({
      subject: "vivo人才测评通知",
      from: '"iTalent招聘助手" <vivo-noreply@italent.cn>',
      text: "测评链接将于 2026年09月22日 周二 08:59 失效，马上开始测评 (https://bsurl.cn/v2/demo999)",
      date: "2026-09-10T08:52:00Z",
    });
    expect(beisen.matched).toBe(true);
    expect(beisen.company).toBe("vivo");
    expect(beisen.timeMode).toBe("deadline");
    expect(beisen.startAt).toBe("2026-09-22T00:59:00.000Z");
    expect(beisen.location).toBe("https://bsurl.cn/v2/demo999");

    // 4. 实习留用邀请识别为录用意向
    const retention = parseRecruitmentEmailByRules({
      subject: "【快手校招】快手邀请你参与实习留用啦！",
      from: '"快手招聘" <zhaopin@kuaishou.com>',
      text: "恭喜获得实习留用资格，请在3个工作日内点击 https://campus.kuaishou.cn/recruit/campus/e/demo 确认意愿。",
      date: "2026-09-17T12:00:00Z",
    });
    expect(retention.matched).toBe(true);
    expect(retention.company).toBe("快手");
    expect(retention.kind).toBe("offer");
    expect(retention.stageName).toBe("录用意向");
    expect(retention.timeMode).toBe("deadline");

    // 5. 纯投递回执正文即使写“后续包含在线测评/笔试/面试”也不误报，智联推荐宣传邮件也拦截
    const receiptWithFlow = parseRecruitmentEmailByRules({
      subject: "欢迎投递某科技公司 2027 校园招聘职位",
      from: '"recruitment" <recruitment@dji.com>',
      text: "感谢您的投递！校招流程说明：简历筛选 -> 在线测评 -> 在线笔试 -> 面试 -> Offer。",
      date: "2026-09-15T07:30:00Z",
    });
    expect(receiptWithFlow.matched).toBe(false);

    const zhaopinPromo = parseRecruitmentEmailByRules({
      subject: "尊敬的同学【智联推荐】某集团 2027秋季 校园招聘正式启动！",
      from: '"智联招聘" <cpm_zhaopin@mail.zhaopin.cn>',
      text: "海量正式offer等你来拿，立即投递！",
      date: "2026-10-03T23:00:00Z",
    });
    expect(zhaopinPromo.matched).toBe(false);

    // 6. 阿里带连字符日期、京东带括号说明测评地址与48小时截止、以及训练营/校招网申宣传拦截
    const aliHyphen = parseRecruitmentEmailByRules({
      subject: "【阿里巴巴 校园招聘】在线笔试提醒",
      from: "recruiting@alibaba-inc.com",
      text: "最近一场AI研发工程师笔试将于2026年-09月-05日-14时-00分（北京时间）进行。\n登录链接：https://campus-talent.alibaba.com/personal/campus-application",
      date: "2026-09-04T02:00:00Z",
    });
    expect(aliHyphen.matched).toBe(true);
    expect(aliHyphen.company).toBe("阿里巴巴");
    expect(aliHyphen.startAt).toBe("2026-09-05T06:00:00.000Z");

    const jdShort = parseRecruitmentEmailByRules({
      subject: "【京东校招】2027 测评通知",
      from: "campus@jd.com",
      text: "测评地址（这是您的专属地址，请勿转发给他人）：3.cn/demo123 (https://3.cn/demo123)\n建议您在48小时内完成测评。",
      date: "2026-09-02T10:00:00Z",
    });
    expect(jdShort.matched).toBe(true);
    expect(jdShort.company).toBe("京东");
    expect(jdShort.timeMode).toBe("deadline");
    expect(jdShort.location).toBe("https://3.cn/demo123");

    const campPromo = parseRecruitmentEmailByRules({
      subject: "【某厂校招】实战训练营：线上课题+20万奖金+直通校招Offer",
      from: "CampusHR@oppo.com",
      text: "优秀者直通2027届校招终面/Offer，立即报名参加训练营！",
      date: "2026-06-02T08:00:00Z",
    });
    expect(campPromo.matched).toBe(false);

    // 7. 反误杀回归：真实综合能力测评正文开头带“招聘已正式启动”问候语仍须正常命中
    const assessWithGreeting = parseRecruitmentEmailByRules({
      subject: "联想2026实习生招聘-综合能力测评",
      from: "chinacampus@lenovo.com",
      text: "同学您好！联想2026实习生校招已正式启动，现诚邀您参加在线综合能力测评，请在3个自然日内完成：https://test.ceping.com/demo",
      date: "2026-05-21T07:00:00Z",
    });
    expect(assessWithGreeting.matched).toBe(true);
    expect(assessWithGreeting.company).toBe("联想");
    expect(assessWithGreeting.kind).toBe("assessment");
    expect(assessWithGreeting.timeMode).toBe("deadline");
  });

  it("严格拦截拒信、面试调研问卷、校招直播宣传、专家平台与验证码邮件", () => {
    const cases = [
      {
        subject: "感谢您应聘蚂蚁集团",
        from: '"蚂蚁集团招聘" <ant_recruiting@antgroup.com>',
        text: "感谢您投递大模型工程岗位，在认真评估您的简历后，结果为：未通过。欢迎继续关注。",
      },
      {
        subject: "来自SHEIN的应聘反馈通知",
        from: '"SHEIN" <shein-no-reply@mail.mokahr.com>',
        text: "我们不得不遗憾地通知您，您本次 Java开发工程师 的投递流程已结束，简历已录入人才库。",
      },
      {
        subject: "字节跳动面试体验调研",
        from: '"字节跳动 ByteDance" <people@mail.bytedance.net>',
        text: "感谢参加面试，诚邀您花 1 分钟填写面试体验调研问卷。",
      },
      {
        subject: "【Shopee校园招聘】邀请您对面试满意度进行评价",
        from: '"Shopee" <shopee-no-reply@mail.mokahr.com>',
        text: "感谢参与面试，点击链接评价本次面试体验。",
      },
      {
        subject: "【携程校招】今晚19:00，秋招冲刺岗位专场直播来袭！",
        from: '"携程集团(Trip.com Group)" <trip-no-reply@mail.mokahr.co>',
        text: "HR面试重点提前划，立即预约直播，福袋送不停！",
      },
      {
        subject: "蚂蚁集团2027校招持续招聘中",
        from: '"蚂小招" <anttalent@antgroup.com>',
        text: "以下职位持续热招：后端工程师、算法工程师。笔试彩蛋：笔试可放心用AI。",
      },
      {
        subject: "【智囊团】恭喜通过专业评估！完成签约即可参与任务",
        from: '"智囊团_ExpertHub" <experthub@tencent.com>',
        text: "恭喜通过智囊团专家平台专业背景评估，请签署专家合同入驻平台。",
      },
      {
        subject: "您的登录验证码为 839201",
        from: "安全中心 <security@example.com>",
        text: "您正在尝试登录账号，验证码 10 分钟内有效，请勿泄露。",
      },
    ];

    for (const c of cases) {
      const res = parseRecruitmentEmailByRules({ ...c, date: "2026-11-22T02:00:00Z" });
      expect(res.matched, `Expected rejected: ${c.subject}`).toBe(false);
    }
  });

  it("支持标准公司名归一化与 ICS 日历附件解析", () => {
    expect(normalizeCompanyName("深圳市大疆创新科技有限公司")).toBe("大疆");
    expect(normalizeCompanyName("深圳虾皮信息科技有限公司")).toBe("Shopee");
    expect(normalizeCompanyName("字节跳动 ByteDance")).toBe("字节跳动");
    expect(normalizeCompanyName("华为公司")).toBe("华为");
    expect(normalizeCompanyName("招聘小秘书")).toBe("");

    const ics = parseIcsEvent(
      "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Asia/Shanghai:20261128T140000\r\nDTEND;TZID=Asia/Shanghai:20261128T150000\r\nSUMMARY:美团一面\r\nLOCATION:https://meeting.tencent.com/dm/icsdemo\r\nEND:VEVENT\r\nEND:VCALENDAR",
    );
    expect(ics?.startAt).toBe("2026-11-28T06:00:00.000Z");
    expect(ics?.endAt).toBe("2026-11-28T07:00:00.000Z");
    expect(ics?.location).toBe("https://meeting.tencent.com/dm/icsdemo");

    expect(htmlToCleanText("<style>.a{color:red}</style><p>你好<a href=\"https://a.com/x\">链接</a></p>")).toContain(
      "https://a.com/x",
    );
  });

  it("智能推断关联投递记录（单活自动推断、同集团回退、多活并行不乱猜）与语义去重合并", () => {
    const records: ApplicationRecord[] = [
      makeRecord({ id: "hw-1", company: "华为", position: "2012 实验室存储研发" }),
      makeRecord({ id: "ali-1", company: "阿里云", position: "基础架构工程师" }),
      makeRecord({ id: "bd-1", company: "字节跳动", position: "AI Agent 后端" }),
      makeRecord({ id: "bd-2", company: "字节跳动", position: "推荐架构研发" }),
    ];

    // 1. 邮件未写岗位，公司仅有 1 条进行中流程 -> 自动推断关联
    const hwInf = inferRecordForEmail(records, "华为", "");
    expect(hwInf.record?.id).toBe("hw-1");
    expect(hwInf.matchType).toBe("company_sole_active");

    // 2. 同集团回退（阿里巴巴 -> 阿里云唯一进行中流程）
    const aliInf = inferRecordForEmail(records, "阿里巴巴", "");
    expect(aliInf.record?.id).toBe("ali-1");
    expect(aliInf.matchType).toBe("group_sole_active");

    // 3. 同公司存在 2 条并行进行中流程且邮件未写岗位 -> 宁可留空不乱关联
    const bdAmbiguous = inferRecordForEmail(records, "字节跳动", "");
    expect(bdAmbiguous.record).toBeUndefined();
    expect(bdAmbiguous.matchType).toBe("none");

    // 4. 写明岗位时精准区分
    const bdExact = inferRecordForEmail(records, "字节跳动", "AI Agent开发工程师");
    expect(bdExact.record?.id).toBe("bd-1");
    expect(bdExact.matchType).toBe("exact");

    // 4.5 独立招聘子公司（如沐瞳科技/腾讯音乐/搜狐畅游）不与字节/腾讯/搜狐交叉误配
    const endedByte = makeRecord({
      id: "bd-old",
      company: "字节跳动",
      position: "AI Agent",
      status: "archived",
    });
    const moontonActive = makeRecord({
      id: "mt-1",
      company: "沐瞳科技",
      position: "后端",
      status: "active",
    });
    const crossGuard = inferRecordForEmail([endedByte, moontonActive], "字节跳动", "基础架构后端研发");
    expect(crossGuard.record).toBeUndefined();
    expect(crossGuard.matchType).toBe("none");

    // 5. 同场笔试连发多封提醒 -> 语义去重并合并缺失链接
    const existing: ScheduleEvent = {
      id: "ev-dup-1",
      company: "去哪儿",
      position: "",
      stageName: "笔试",
      title: "去哪儿 笔试",
      kind: "written_test",
      startAt: "2026-10-11T06:00:00.000Z",
      endAt: "2026-10-11T14:00:00.000Z",
      timeMode: "scheduled",
      source: "email",
      status: "pending_confirm",
      syncedToRecord: false,
      createdAt: "2026-10-10T02:00:00.000Z",
      updatedAt: "2026-10-10T02:00:00.000Z",
    };
    const dup = findDuplicateEmailEvent([existing], {
      company: "去哪儿旅行",
      position: "AI全栈工程师",
      kind: "written_test",
      startAt: "2026-10-11T06:00:00.000Z",
      timeMode: "scheduled",
    });
    expect(dup?.id).toBe("ev-dup-1");

    const { merged, changed } = mergeDuplicateEvent(
      existing,
      {
        company: "去哪儿",
        position: "AI全栈工程师",
        stageName: "笔试",
        startAt: "2026-10-11T06:00:00.000Z",
        timeMode: "scheduled",
        location: "https://qunar.acmcoder.com/cand/login?demo",
      },
      "2026-10-11T08:00:00.000Z",
    );
    expect(changed).toBe(true);
    expect(merged.position).toBe("AI全栈工程师");
    expect(merged.location).toBe("https://qunar.acmcoder.com/cand/login?demo");
  });

  it("ICS 生成按 timeMode 分模式导出（跳过 flexible，deadline 导出为全天提醒）", () => {
    const ics = buildIcsCalendar([
      {
        id: "ev-1",
        company: "腾讯",
        position: "后台开发",
        stageName: "一面",
        title: "腾讯 后台开发 一面",
        kind: "interview",
        startAt: "2026-11-25T06:30:00.000Z",
        endAt: "2026-11-25T07:30:00.000Z",
        timeMode: "scheduled",
        location: "https://meeting.tencent.com/dm/abc",
        source: "email",
        status: "confirmed",
        syncedToRecord: false,
        createdAt: "2026-11-22T00:00:00.000Z",
        updatedAt: "2026-11-22T00:00:00.000Z",
      },
      {
        id: "ev-2",
        company: "科大讯飞",
        position: "",
        stageName: "录用意向",
        title: "科大讯飞 录用意向",
        kind: "offer",
        startAt: "2026-10-23T15:59:00.000Z",
        timeMode: "deadline",
        source: "email",
        status: "confirmed",
        syncedToRecord: false,
        createdAt: "2026-10-16T00:00:00.000Z",
        updatedAt: "2026-10-16T00:00:00.000Z",
      },
      {
        id: "ev-3",
        company: "华为",
        position: "",
        stageName: "测评",
        title: "华为 测评",
        kind: "assessment",
        startAt: "2026-11-11T07:33:00.000Z",
        timeMode: "flexible",
        source: "email",
        status: "confirmed",
        syncedToRecord: false,
        createdAt: "2026-11-11T07:33:00.000Z",
        updatedAt: "2026-11-11T07:33:00.000Z",
      },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:腾讯 后台开发 一面");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261023");
    expect(ics).toContain("SUMMARY:[截止] 科大讯飞 录用意向");
    expect(ics).not.toContain("华为 测评");
  });

  it("个人大模型客户端支持智能 URL 归一化、SSRF 防护与容错 JSON 提取", async () => {
    expect(normalizeLlmEndpoint("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(normalizeLlmEndpoint("https://api.deepseek.com/v1/")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(normalizeLlmEndpoint("https://api.deepseek.com/v1/chat/completions")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
    expect(normalizeLlmEndpoint("https://open.bigmodel.cn/api/paas/v4")).toBe(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    );
    expect(normalizeLlmEndpoint("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    expect(normalizeLlmEndpoint("https://generativelanguage.googleapis.com/v1beta/openai")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
    expect(normalizeLlmEndpoint("https://ark.cn-beijing.volces.com/api/v3")).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    );
    expect(normalizeLlmEndpoint("https://ws123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1")).toBe(
      "https://ws123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    expect(normalizeLlmEndpoint("file:///etc/passwd")).toBeNull();

    // 默认拦截本机与内网/云元数据 IP，仅显式 allowLocal=true 时放行本地模型
    expect((await assertSafeLlmUrl("http://127.0.0.1:11434/v1/chat/completions", false)).ok).toBe(false);
    expect((await assertSafeLlmUrl("http://169.254.169.254/latest/meta-data", false)).ok).toBe(false);
    expect((await assertSafeLlmUrl("http://192.168.1.10:8000/v1/chat/completions", false)).ok).toBe(false);
    expect((await assertSafeLlmUrl("http://localhost:11434/v1/chat/completions", false)).ok).toBe(false);
    expect((await assertSafeLlmUrl("http://127.0.0.1:11434/v1/chat/completions", true)).ok).toBe(true);

    // 兼容 <think> 思考块 + Markdown 围栏 JSON 提取
    expect(
      extractJsonObject('<think>先分析邮件...</think>\n```json\n{"matched":true,"company":"腾讯"}\n```'),
    ).toEqual({ matched: true, company: "腾讯" });
    expect(extractJsonObject('结果如下：{"ok":true,"n":1} 结束')).toEqual({ ok: true, n: 1 });
  });

  it("支持无 API Key 时直接贴入网页版大模型输出的 JSON 完成邮箱日程解析", async () => {
    const parsedOk = await parseRecruitmentEmail({
      subject: "",
      from: "",
      text: '```json\n{"matched":true,"company":"深圳市大疆创新科技有限公司","position":"飞控算法","stageName":"技术二面","kind":"interview","actionHint":"schedule","timeMode":"scheduled","startAt":"2026-11-29T14:00:00+08:00","location":"https://vc.feishu.cn/j/665544"}\n```',
    });
    expect(parsedOk.matched).toBe(true);
    expect(parsedOk.parserSource).toBe("llm");
    expect(parsedOk.company).toBe("大疆");
    expect(parsedOk.position).toBe("飞控算法");
    expect(parsedOk.stageName).toBe("二面");
    expect(parsedOk.startAt).toBe("2026-11-29T06:00:00.000Z");
    expect(parsedOk.location).toBe("https://vc.feishu.cn/j/665544");

    const parsedRejected = await parseRecruitmentEmail({
      subject: "",
      from: "",
      text: '{"matched":false,"actionHint":"fail","reason":"感谢信不建日程"}',
    });
    expect(parsedRejected.matched).toBe(false);
    expect(parsedRejected.actionHint).toBe("fail");
  });

  it("推理/固定温度模型省略 temperature=0 并在 400 时降级兼容重试", async () => {
    const origFetch = globalThis.fetch;
    const seenPayloads: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      seenPayloads.push(body);
      if (body.model === "custom-relay" && "response_format" in body) {
        return new Response("response_format not supported", { status: 400 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const r1 = await callOpenAiCompatibleJson(
        { baseUrl: "https://8.8.8.8/v1", model: "gpt-5-mini", apiKey: "k" },
        [{ role: "user", content: "json" }],
        { maxTokens: 512 },
      );
      expect(r1.ok).toBe(true);
      expect("temperature" in seenPayloads[0]).toBe(false);
      expect(seenPayloads[0].max_completion_tokens).toBe(512);

      const r2 = await callOpenAiCompatibleJson(
        { baseUrl: "https://8.8.8.8/v1", model: "kimi-k3.1-pro-highspeed", apiKey: "k" },
        [{ role: "user", content: "json" }],
        { maxTokens: 512 },
      );
      expect(r2.ok).toBe(true);
      expect("temperature" in seenPayloads[1]).toBe(false);

      const r3 = await callOpenAiCompatibleJson(
        { baseUrl: "https://8.8.8.8/v1", model: "custom-relay", apiKey: "k" },
        [{ role: "user", content: "json" }],
      );
      expect(r3.ok).toBe(true);
      if (r3.ok) expect(r3.jsonMode).toBe("fallback");
      expect(seenPayloads[2].temperature).toBe(0);
      expect("response_format" in seenPayloads[3]).toBe(false);
      expect("temperature" in seenPayloads[3]).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("华为无换行同行键值邮件不吞入面试链接正文，并准确识别专业面试1为一面", () => {
    const res = parseRecruitmentEmailByRules({
      subject: "面试邀请函",
      from: '"华为招聘" <campus@huawei.com>',
      text: "亲爱的同学，您好！诚邀您参加华为公司招聘 面试信息 面试时间： (UTC+08:00)Beijing 2026-11-26 10:00 (建议预留前后各1小时) 面试环节： 专业面试1 面试方式： 远程 面试职位： AI技术应用 面试链接： 进入面试请点击此链接 （如涉及双机位远程面试，两部终端设备均点击此链接进入） 确认参加 https://career.huawei.com/reccampportal/interview/interview.html?interviewId=3607008",
      date: new Date("2026-11-24T09:00:00+08:00"),
    });
    expect(res.matched).toBe(true);
    expect(res.company).toBe("华为");
    expect(res.position).toBe("AI技术应用");
    expect(res.stageName).toBe("一面");
    expect(res.startAt).toBe("2026-11-26T02:00:00.000Z");
    expect(res.location).toContain("career.huawei.com");
  });

  it("专属大厂模板特判：字节 People AI 在线初评精准识别为笔试+精确截止时刻+完整岗位+结构化备注", () => {
    const res = parseRecruitmentEmailByRules({
      subject: "字节跳动校园招聘在线初评邀请 — Agent研发工程师 - 抖音用户增长",
      from: '"People AI" <people_ai_interview@mail.bytedance.net>',
      text: [
        "字节跳动校园招聘在线初评邀请",
        "[https://lf3-static.bytednsdoc.com/obj/eden-cn/demo/banner.jpg]",
        "同学你好，诚邀你参加字节跳动校园招聘- Agent研发工程师 - 抖音用户增长 岗位的在线初评环节。你可登录字节跳动校招官网（https://jobs.bytedance.com/campus）了解岗位相关信息。",
        "【初评信息】",
        "* 初评形式：在线问答 + AI 能力测评（电脑端进行，需开启摄像头和麦克风）",
        "* 初评时长：约 65 分钟",
        "* 初评内容：可能涵盖过往经历、岗位能力、基于 Trae Agent 开发模式 的 AI 能力测评等",
        "* 初评链接：https://jobs.bytedance.com/interview/demo123456",
        "* 有效期：请在 2026-11-30 11:51:37 之前完成，逾期链接将自动失效",
        "初评开始后不可切换屏幕。",
      ].join("\n"),
      date: "2026-11-27T03:52:26.000Z",
    });

    expect(res.matched).toBe(true);
    expect(res.templateId).toBe("bytedance-online-screening");
    expect(res.company).toBe("字节跳动");
    expect(res.position).toBe("Agent研发工程师 - 抖音用户增长");
    expect(res.kind).toBe("written_test");
    expect(res.stageName).toBe("笔试");
    expect(res.timeMode).toBe("deadline");
    expect(res.startAt).toBe("2026-11-30T03:51:00.000Z");
    expect(res.endAt).toBeUndefined();
    expect(res.location).toBe("https://jobs.bytedance.com/interview/demo123456");
    expect(res.notes).toContain("约 65 分钟");
    expect(res.notes).toContain("不可切屏");
    expect(res.snippet).not.toContain(".jpg");
  });

  it("专属模板与通用防呆：牛客 AI 面试/跨天笔试窗口、ICS 占位符过滤、阿里试做链接防抢、腾讯48h测评与调研拦截", () => {
    // 1. 牛客笔试：ICS LOCATION="以邮件正文为准" 不劫持正文真实考试地址，且从试卷名称提岗位
    const pdd = parseRecruitmentEmailByRules({
      subject: "拼多多集团-PDD校招邀请你参加在线技术笔试",
      from: '"拼多多集团-PDD" <support@batchmail.nowcoder.net>',
      text: "感谢投递拼多多集团-PDD。\n试卷名称：2027届服务端研发工程师笔试（0906）\n考试时间：(北京时间,UTC+08:00)2026-09-06 19:00:00 -- 21:00:00\n考试时长：120分钟\n考试地址：https://hr.nowcoder.com/v1/s/demoExam#\n点击确认是否参加考试 (https://hr.nowcoder.com/v1/s/demoConfirm#)",
      icsText:
        "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=Asia/Shanghai:20260906T190000\r\nDTEND;TZID=Asia/Shanghai:20260906T210000\r\nLOCATION:以邮件正文为准\r\nEND:VEVENT\r\nEND:VCALENDAR",
      date: "2026-09-04T10:00:00Z",
    });
    expect(pdd.matched).toBe(true);
    expect(pdd.company).toBe("拼多多");
    expect(pdd.position).toBe("服务端研发工程师");
    expect(pdd.location).toBe("https://hr.nowcoder.com/v1/s/demoExam");

    // 2. 牛客跨天 AI 面试窗口 -> deadline 到截止时刻，且不选确认参加链接
    const mtAi = parseRecruitmentEmailByRules({
      subject: "牛客网邀请你参加在线AI面试",
      from: '"美团" <support@usermail.nowcoder.com>',
      text: "您投递的 美团 AI面试即将在 1天小时(03-29 16:26)后截止。\n点击确认是否参加面试 (https://hr.nowcoder.com/v1/s/confirm00#)\n面试时间：2026-03-27 16:26 至 2026-03-29 16:26\n面试链接：点击链接进入面试 https://hr.nowcoder.com/v1/s/room99#",
      date: "2026-03-28T08:11:00Z",
    });
    expect(mtAi.matched).toBe(true);
    expect(mtAi.company).toBe("美团");
    expect(mtAi.timeMode).toBe("deadline");
    expect(mtAi.startAt).toBe("2026-03-29T08:26:00.000Z");
    expect(mtAi.endAt).toBeUndefined();
    expect(mtAi.location).toBe("https://hr.nowcoder.com/v1/s/room99");

    // 3. 阿里在线笔试含牛客试做链接时，优先正式登录链接并正确提取开考时间
    const ali = parseRecruitmentEmailByRules({
      subject: "【阿里巴巴校园招聘】在线笔试邀请",
      from: "recruiting@alibaba-inc.com",
      text: "[https://img.alicdn.com/demo-banner.png]\n笔试开始时间：2026-09-02 19:00 (UTC+8)\n考试时长：100/120分钟\n考试题型：选择题/填空题+AI Coding题\n试做链接：https://exam.nowcoder.com/cts/17520846/summary\n登录链接：https://campus-talent.alibaba.com/personal/campus-application",
      date: "2026-09-02T05:59:00Z",
    });
    expect(ali.matched).toBe(true);
    expect(ali.company).toBe("阿里巴巴");
    expect(ali.startAt).toBe("2026-09-02T11:00:00.000Z");
    expect(ali.location).toBe("https://campus-talent.alibaba.com/personal/campus-application");
    expect(ali.snippet).not.toContain(".png");

    // 4. 腾讯 48 小时综合素质测评提取 sdc.qq.com 与 deadline
    const txAssess = parseRecruitmentEmailByRules({
      subject: "腾讯邀请你参加综合素质测评-请在48小时内完成",
      from: "ceping@ceping.tencent.com",
      text: "感谢投递腾讯，烦请在收到邮件 48小时内 完成测评。方式2：请复制并在浏览器打开链接： https://sdc.qq.com/s/demo123 进行测试",
      date: "2026-03-18T07:47:00Z",
    });
    expect(txAssess.matched).toBe(true);
    expect(txAssess.company).toBe("腾讯");
    expect(txAssess.timeMode).toBe("deadline");
    expect(txAssess.location).toBe("https://sdc.qq.com/s/demo123");

    // 5. 漏网噪声全部拦截：众安面试体验问卷、牛客用户调研、蚂蚁岗位更名公告与校招启动宣传
    const noiseCases = [
      {
        subject: "今天，您在众安的面试体验如何？",
        from: '"众安保险" <zhongan-no-reply@mail.mokahr.co>',
        text: "感谢您参加了众安 2026年4月8日 14:55 的面试，诚邀您花2分钟反馈今天的面试体验。",
      },
      {
        subject: "【牛客网申助手】特邀您进行用户调研，有机会获得50元京东卡",
        from: '"调研组" <survey@nowcoder.com>',
        text: "邀请您填写用户调研问卷，抽取京东卡。",
      },
      {
        subject: "【蚂蚁集团】关于校招 AI 技术岗位名称优化的说明",
        from: '"蚂小招" <anttalent@antgroup.com>',
        text: "此次仅为名称和分类的优化，部分同学可能会收到 AI Coding 考试的笔试安排。",
      },
      {
        subject: "蚂蚁集团2027校招启动🔥超80%AI岗+笔试可用AI，赶紧冲！",
        from: '"蚂小招" <anttalent@antgroup.com>',
        text: "蚂蚁集团2027届校园招聘已经正式启动啦！笔试可放心用AI。",
      },
    ];
    for (const c of noiseCases) {
      const r = parseRecruitmentEmailByRules({ ...c, date: "2026-09-01T00:00:00Z" });
      expect(r.matched, `Expected rejected: ${c.subject}`).toBe(false);
    }
  });
});
