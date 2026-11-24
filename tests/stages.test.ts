import { describe, expect, it } from "vitest";
import {
  advanceStagesToTarget,
  applyStageStatusChange,
  buildInitialStages,
  computePipelineMetrics,
  createDefaultStageDrafts,
  groupAndSortCompanies,
  inferStageType,
  normalizeStage,
  reconcileEditedStages,
  STAGE_TEMPLATES,
  stageProgress,
} from "../shared/stages";
import type { ApplicationRecord } from "../shared/types";

describe("OfferLine 阶段领域模型与分组排序", () => {
  it("兼容老版缺少 type 和 id 的阶段并正确推断类别", () => {
    expect(inferStageType({ name: "投递" })).toBe("application");
    expect(inferStageType({ name: "二面" })).toBe("interview");
    expect(inferStageType({ name: "正式offer" })).toBe("offer");
    expect(inferStageType({ name: "笔试" })).toBe("other");

    const normalized = normalizeStage({ name: "HR面", status: "pass" }, 4);
    expect(normalized.id).toBe("stage-5");
    expect(normalized.type).toBe("interview");
    expect(normalized.status).toBe("pass");
  });

  it("初始流程若首阶段为投递则自动通过并推进下一阶段", () => {
    const stages = buildInitialStages(createDefaultStageDrafts());
    expect(stages[0].status).toBe("pass");
    expect(stages[1].status).toBe("current");
    expect(stages[2].status).toBe("pending");
  });

  it("推进阶段、自动对齐邮箱轮次与自由改判无未来锁", () => {
    const stages = buildInitialStages(createDefaultStageDrafts());
    const afterPass = applyStageStatusChange(stages, 1, "pass");
    expect(afterPass[1].status).toBe("pass");
    expect(afterPass[2].status).toBe("current");

    const synced = advanceStagesToTarget(afterPass, "二面", "current");
    expect(synced[4].status).toBe("pass");
    expect(synced[5].status).toBe("current");

    const reverted = applyStageStatusChange(synced, 1, "pending");
    expect(reverted[1].status).toBe("pending");
  });

  it("编辑流程保留未删除阶段历史状态", () => {
    const stages = applyStageStatusChange(
      buildInitialStages(createDefaultStageDrafts()),
      1,
      "pass",
    );
    const edited = reconcileEditedStages(stages, [
      { id: stages[0].id, name: "投递", type: "application" },
      { id: stages[2].id, name: "笔试加题", type: "other" },
      { id: "new-1", name: "终面", type: "interview" },
    ]);
    expect(edited[0].status).toBe("pass");
    expect(edited[1].status).toBe("current");
    expect(edited[2].status).toBe("pending");
  });

  it("置顶公司优先、全挂公司沉底并正确计算统计指标", () => {
    const baseStages = buildInitialStages(createDefaultStageDrafts());
    const makeRec = (partial: Partial<ApplicationRecord>): ApplicationRecord => ({
      id: "id",
      company: "A",
      position: "后端",
      stages: baseStages,
      status: "active",
      priority: "normal",
      pinned: false,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      ...partial,
    });

    const failedStages = applyStageStatusChange(baseStages, 1, "fail");
    const interviewStages = applyStageStatusChange(baseStages, 4, "current");

    const list: ApplicationRecord[] = [
      makeRec({ id: "1", company: "挂了公司", stages: failedStages }),
      makeRec({ id: "2", company: "普通推进", stages: interviewStages }),
      makeRec({ id: "3", company: "置顶公司", pinned: true }),
    ];

    const groups = groupAndSortCompanies(list, "progress");
    expect(groups.map((g) => g.company)).toEqual(["置顶公司", "普通推进", "挂了公司"]);

    const metrics = computePipelineMetrics(list);
    expect(metrics.total).toBe(3);
    expect(metrics.interviewed).toBe(1);
    expect(metrics.failed).toBe(1);
    expect(stageProgress(baseStages)).toBeCloseTo(1 / baseStages.length);

    expect(STAGE_TEMPLATES.map((t) => t.label)).toEqual(["实习", "校招", "社招"]);
    expect(STAGE_TEMPLATES.find((t) => t.id === "campus")?.names).not.toContain("Offer评估");
    expect(STAGE_TEMPLATES.find((t) => t.id === "campus")?.names).toContain("谈薪");
    expect(STAGE_TEMPLATES.find((t) => t.id === "social")?.names).toContain("谈薪");
    expect(inferStageType({ name: "谈薪" })).toBe("other");
  });
});
