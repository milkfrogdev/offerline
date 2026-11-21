import { computePipelineMetrics } from "../../shared/stages";
import type { ApplicationRecord } from "../../shared/types";

export function PipelineMetrics({ records }: { records: readonly ApplicationRecord[] }) {
  const m = computePipelineMetrics(records);
  return (
    <section className="metrics-strip" aria-label="求职进程统计">
      <div className="metric-cell">
        <span className="metric-label">总投递</span>
        <strong className="metric-value">{m.total}</strong>
      </div>
      <div className="metric-cell">
        <span className="metric-label">推进中</span>
        <strong className="metric-value accent">{m.active}</strong>
      </div>
      <div className="metric-cell">
        <span className="metric-label">已进面试</span>
        <strong className="metric-value">{m.interviewed}</strong>
      </div>
      <div className="metric-cell">
        <span className="metric-label">Offer</span>
        <strong className="metric-value accent">{m.offered}</strong>
      </div>
      <div className="metric-cell">
        <span className="metric-label">面试转化率</span>
        <strong className="metric-value">{m.interviewRate}%</strong>
      </div>
      <div className="metric-cell">
        <span className="metric-label">待跟进</span>
        <strong className="metric-value">{m.upcomingFollowUps}</strong>
      </div>
    </section>
  );
}
