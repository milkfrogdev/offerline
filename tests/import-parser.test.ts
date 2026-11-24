import { describe, expect, it } from "vitest";
import {
  extractJsonValue,
  looksLikeJsonPayload,
  parseImportedPipelineRecords,
} from "../shared/import-parser";

describe("智能批量导入 JSON 提取与时间线归一化", () => {
  it("兼容 <think> 思考块与 Markdown 围栏提取数组和对象", () => {
    const arr = extractJsonValue(
      '<think>思考过程...</think>\n```json\n[{"company":"腾讯","position":"后端"}]\n```\n以上是结果。',
    );
    expect(Array.isArray(arr)).toBe(true);

    const obj = extractJsonValue('前导说明 {"records":[{"company":"华为","position":"开发"}]} 尾注');
    expect(obj).toEqual({ records: [{ company: "华为", position: "开发" }] });
    expect(looksLikeJsonPayload('```json\n[{"company":"腾讯"}]\n```')).toBe(true);
    expect(looksLikeJsonPayload("字节跳动 后端研发 一面中")).toBe(false);
  });

  it("支持中英文阶段状态映射、公司名归一化及状态词兜底救援", () => {
    const res = parseImportedPipelineRecords(`
      [
        {
          "company": "深圳市大疆创新科技有限公司",
          "position": "嵌入式开发",
          "stages": [
            {"name": "投递", "status": "已通过"},
            {"name": "笔试", "status": "跳过"},
            {"name": "一面", "status": "进行中"},
            {"name": "二面", "status": "待进行"}
          ]
        },
        {
          "company": "iflytek",
          "position": "大模型工程师",
          "status": "二面挂了"
        }
      ]
    `);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(2);
    expect(res.items[0].company).toBe("大疆");
    expect(res.items[0].stages.map((s) => s.status)).toEqual(["pass", "skip", "current", "pending"]);

    expect(res.items[1].company).toBe("科大讯飞");
    const secondRound = res.items[1].stages.find((s) => s.name === "二面");
    const firstRound = res.items[1].stages.find((s) => s.name === "一面");
    expect(firstRound?.status).toBe("pass");
    expect(secondRound?.status).toBe("fail");
  });

  it("拦截缺少有效 company 或非 JSON 的输入并给出明确报错", () => {
    const badText = parseImportedPipelineRecords("普通文本没有 JSON");
    expect(badText.ok).toBe(false);

    const noCompany = parseImportedPipelineRecords('[{"position":"后端"}]');
    expect(noCompany.ok).toBe(false);
  });
});
