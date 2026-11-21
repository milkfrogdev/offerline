import {
  PRIORITY_LABELS,
  currentStageLabel,
  stageProgress,
  visitFreshness,
  type CompanyGroup,
} from "../../shared/stages";
import type { ApplicationRecord } from "../../shared/types";

export function PipelineTable({
  groups,
  selectedId,
  onSelect,
  onVisitCompany,
  onPinCompany,
  onArchiveToggle,
}: {
  groups: readonly CompanyGroup[];
  selectedId: string | null;
  onSelect: (record: ApplicationRecord) => void;
  onVisitCompany: (company: string, url?: string) => void;
  onPinCompany: (company: string, pinned: boolean) => void;
  onArchiveToggle: (record: ApplicationRecord) => void;
}) {
  return (
    <div className="pipeline-panel">
      {groups.map((g) => {
        const fresh = visitFreshness(g.lastVisitedAt);
        return (
          <section className="company-block" key={g.company}>
            <div className="company-head">
              <div className={"company-title" + (g.allTerminated ? " terminated" : "")}>
                <span>{g.company}</span>
                {g.pinned && <span className="freshness-tag">· 已置顶</span>}
                <span className="freshness-tag">· {g.records.length} 个岗位</span>
              </div>
              <div className="company-meta">
                <span className={`freshness-tag ${fresh.level}`}>{fresh.text}</span>
                {g.url && (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => onVisitCompany(g.company, g.url)}
                  >
                    官网进度 ↗
                  </button>
                )}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => onPinCompany(g.company, !g.pinned)}
                >
                  {g.pinned ? "取消置顶" : "置顶"}
                </button>
              </div>
            </div>

            <div className="position-rows">
              {g.records.map((r) => {
                const stage = currentStageLabel(r.stages);
                const doneCount = r.stages.filter(
                  (s) => s.status === "pass" || s.status === "skip",
                ).length;
                const pct = Math.round(stageProgress(r.stages) * 100);
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className={"position-row" + (selectedId === r.id ? " selected" : "")}
                    onClick={() => onSelect(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(r);
                      }
                    }}
                  >
                    <div className="pos-main">
                      <span className="pos-name">{r.position}</span>
                      <div className="pos-sub">
                        {r.city && <span>{r.city}</span>}
                        {r.salary && <span>{r.salary}</span>}
                        {r.sealed && <span>已加密</span>}
                        {r.source && <span>{r.source}</span>}
                        {r.priority !== "normal" && <span>{PRIORITY_LABELS[r.priority]}</span>}
                        {r.nextFollowUpAt && <span>跟进 {r.nextFollowUpAt}</span>}
                      </div>
                    </div>

                    <div className={`stage-text ${stage.tone}`}>{stage.label}</div>

                    <div className="progress-inline">
                      <div className="progress-bar" aria-hidden="true">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      <span>
                        {doneCount}/{r.stages.length}
                      </span>
                    </div>

                    <div>
                      <button
                        type="button"
                        className="quiet"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveToggle(r);
                        }}
                      >
                        {r.status === "archived" ? "恢复" : "归档"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
