import { classifyBoardLane, currentStageLabel, type BoardLane } from "../../shared/stages";
import type { ApplicationRecord } from "../../shared/types";

const LANES: { id: BoardLane; title: string }[] = [
  { id: "screening", title: "投递与筛选" },
  { id: "assessment", title: "笔试与测评" },
  { id: "interview", title: "面试推进中" },
  { id: "closed", title: "Offer / 已结束" },
];

export function StageBoard({
  records,
  selectedId,
  onSelect,
}: {
  records: readonly ApplicationRecord[];
  selectedId: string | null;
  onSelect: (r: ApplicationRecord) => void;
}) {
  return (
    <div className="stage-board">
      {LANES.map((lane) => {
        const list = records.filter((r) => classifyBoardLane(r) === lane.id);
        return (
          <section className="board-lane" key={lane.id}>
            <div className="lane-head">
              <span>{lane.title}</span>
              <span className="lane-count">{list.length}</span>
            </div>
            {list.map((r) => {
              const stage = currentStageLabel(r.stages);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={"lane-card" + (selectedId === r.id ? " selected" : "")}
                  onClick={() => onSelect(r)}
                >
                  <span className="lane-card-company">
                    {r.company}
                    {r.city ? ` · ${r.city}` : ""}
                  </span>
                  <span className="lane-card-pos">{r.position}</span>
                  <span className={`stage-text ${stage.tone}`}>{stage.label}</span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
