import { useEffect, useState } from "react";
import {
  PRIORITY_LABELS,
  STAGE_STATUS_LABELS,
  STAGE_TYPE_LABELS,
} from "../../shared/stages";
import {
  PRIORITY_LEVELS,
  STAGE_TYPES,
  type ApplicationRecord,
  type PriorityLevel,
  type StageDraft,
  type StageStatus,
  type StageType,
} from "../../shared/types";
import { canUseWebCrypto, decryptJson, encryptJson } from "../crypto";

export function DetailDrawer({
  record,
  vaultKey,
  onClose,
  onVisit,
  onUpdate,
  onStageStatus,
  onDelete,
  onError,
  onNotice,
}: {
  record: ApplicationRecord;
  vaultKey: string;
  onClose: () => void;
  onVisit: (record: ApplicationRecord) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onStageStatus: (id: string, stageIndex: number, status: StageStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
}) {
  const [company, setCompany] = useState(record.company);
  const [position, setPosition] = useState(record.position);
  const [url, setUrl] = useState(record.url || "");
  const [city, setCity] = useState(record.city || "");
  const [salary, setSalary] = useState(record.salary || "");
  const [source, setSource] = useState(record.source || "");
  const [priority, setPriority] = useState<PriorityLevel>(record.priority);
  const [nextFollowUpAt, setNextFollowUpAt] = useState(record.nextFollowUpAt || "");
  const [notes, setNotes] = useState(record.notes || "");
  const [editingStages, setEditingStages] = useState(false);
  const [expandedStageIdx, setExpandedStageIdx] = useState<number | null>(() => {
    const idx = record.stages.findIndex((s) => s.status === "current");
    return idx >= 0 ? idx : 0;
  });
  const [drafts, setDrafts] = useState<StageDraft[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCompany(record.company);
    setPosition(record.position);
    setUrl(record.url || "");
    setCity(record.city || "");
    setSalary(record.salary || "");
    setSource(record.source || "");
    setPriority(record.priority);
    setNextFollowUpAt(record.nextFollowUpAt || "");
    setNotes(record.notes || "");
    setEditingStages(false);
    setConfirmDelete(false);
    const activeIdx = record.stages.findIndex((s) => s.status === "current");
    setExpandedStageIdx(activeIdx >= 0 ? activeIdx : 0);

    if (record.sealed && vaultKey && canUseWebCrypto()) {
      void decryptJson<{ salary?: string; notes?: string }>(record.sealed, vaultKey)
        .then((plain) => {
          if (plain.salary !== undefined) setSalary(plain.salary);
          if (plain.notes !== undefined) setNotes(plain.notes);
        })
        .catch(() => {});
    }
  }, [record, vaultKey]);

  async function saveMetadata(sealSensitive = false) {
    setBusy(true);
    try {
      if (sealSensitive) {
        if (!canUseWebCrypto()) {
          throw new Error("浏览器端加密需要 HTTPS 或 localhost 环境。");
        }
        if (!vaultKey) {
          throw new Error("请先在顶部「数据与安全」里设置本次加密口令。");
        }
        const sealed = await encryptJson({ salary, notes }, vaultKey);
        await onUpdate(record.id, {
          company,
          position,
          url: url.trim() || null,
          city,
          salary: "",
          source,
          priority,
          nextFollowUpAt: nextFollowUpAt.trim() || null,
          notes: "",
          sealed,
        });
        onNotice("已加密保存私密薪资与笔记");
      } else {
        await onUpdate(record.id, {
          company,
          position,
          url: url.trim() || null,
          city,
          salary,
          source,
          priority,
          nextFollowUpAt: nextFollowUpAt.trim() || null,
          notes,
          sealed: null,
        });
        onNotice("已保存记录修改");
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function startEditStages() {
    setDrafts(record.stages.map((s) => ({ id: s.id, name: s.name, type: s.type })));
    setEditingStages(true);
  }

  function moveStage(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setDrafts(next);
  }

  async function saveStages() {
    setBusy(true);
    try {
      await onUpdate(record.id, { stages: drafts });
      setEditingStages(false);
      onNotice("流程阶段已更新");
    } catch (e) {
      onError(e instanceof Error ? e.message : "流程保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="inspector-drawer" aria-label="投递详情">
      <div className="drawer-head">
        <div>
          <div className="drawer-company">{record.company}</div>
          <h2>{record.position}</h2>
        </div>
        <button type="button" className="quiet" aria-label="关闭详情" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="drawer-actions">
        {record.url && (
          <button type="button" onClick={() => onVisit(record)}>
            打开投递页 ↗
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onUpdate(record.id, { pinned: !record.pinned })}
        >
          {record.pinned ? "取消置顶" : "置顶"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onUpdate(record.id, {
              status: record.status === "archived" ? "active" : "archived",
            })
          }
        >
          {record.status === "archived" ? "恢复" : "归档"}
        </button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => void onDelete(record.id)}
            >
              确认删除
            </button>
            <button type="button" className="quiet" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
          </>
        ) : (
          <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
            删除
          </button>
        )}
      </div>

      <section>
        <div className="stepper-head">
          <h3>面试流程</h3>
          {!editingStages ? (
            <button type="button" className="quiet" onClick={startEditStages}>
              编辑阶段
            </button>
          ) : (
            <div className="drawer-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void saveStages()}>
                保存流程
              </button>
              <button type="button" className="quiet" onClick={() => setEditingStages(false)}>
                取消
              </button>
            </div>
          )}
        </div>

        {!editingStages ? (
          <div className="stepper-list">
            {record.stages.map((s, idx) => {
              const openControls = expandedStageIdx === idx;
              return (
                <div key={s.id} className={`step-item ${s.status}`}>
                  <button
                    type="button"
                    className="step-row-btn"
                    aria-expanded={openControls}
                    onClick={() => setExpandedStageIdx(openControls ? null : idx)}
                  >
                    <div className="step-title">
                      <span>{s.name}</span>
                      <span className="step-type">{STAGE_TYPE_LABELS[s.type]}</span>
                    </div>
                    <span className="step-type">{STAGE_STATUS_LABELS[s.status]}</span>
                  </button>
                  {openControls && (
                    <div className="step-controls">
                      <button
                        type="button"
                        disabled={busy || s.status === "pass"}
                        onClick={() => void onStageStatus(record.id, idx, "pass")}
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        disabled={busy || s.status === "current"}
                        onClick={() => void onStageStatus(record.id, idx, "current")}
                      >
                        当前
                      </button>
                      <button
                        type="button"
                        disabled={busy || s.status === "skip"}
                        onClick={() => void onStageStatus(record.id, idx, "skip")}
                      >
                        跳过
                      </button>
                      <button
                        type="button"
                        disabled={busy || s.status === "fail"}
                        onClick={() => void onStageStatus(record.id, idx, "fail")}
                      >
                        未过
                      </button>
                      <button
                        type="button"
                        disabled={busy || s.status === "rejected"}
                        onClick={() => void onStageStatus(record.id, idx, "rejected")}
                      >
                        拒绝
                      </button>
                      <button
                        type="button"
                        disabled={busy || s.status === "pending"}
                        onClick={() => void onStageStatus(record.id, idx, "pending")}
                      >
                        待定
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="stage-editor">
            {drafts.map((d, idx) => (
              <div className="stage-edit-row" key={d.id || idx}>
                <input
                  value={d.name}
                  maxLength={40}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...d, name: e.target.value };
                    setDrafts(next);
                  }}
                />
                <select
                  value={d.type || "other"}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...d, type: e.target.value as StageType };
                    setDrafts(next);
                  }}
                >
                  {STAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {STAGE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => moveStage(idx, -1)} disabled={idx === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStage(idx, 1)}
                  disabled={idx === drafts.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={drafts.length <= 1}
                  onClick={() => setDrafts(drafts.filter((_, i) => i !== idx))}
                >
                  删
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDrafts([
                  ...drafts,
                  { id: `custom-${Date.now()}`, name: "加面", type: "interview" },
                ])
              }
            >
              + 添加阶段
            </button>
          </div>
        )}
      </section>

      <section className="dialog-form">
        <div className="stepper-head">
          <h3>岗位信息与复盘笔记</h3>
          {record.sealed && <span className="step-type">已用 AES-256-GCM 加密</span>}
        </div>
        <div className="meta-grid">
          <label className="field">
            公司
            <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={100} />
          </label>
          <label className="field">
            岗位
            <input value={position} onChange={(e) => setPosition(e.target.value)} maxLength={100} />
          </label>
          <label className="field">
            城市
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="如 上海 / 远程" maxLength={40} />
          </label>
          <label className="field">
            薪资预期
            <input value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="如 35k·16薪" maxLength={60} />
          </label>
          <label className="field">
            渠道
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="如 内推 / 官网" maxLength={40} />
          </label>
          <label className="field">
            意向度
            <select value={priority} onChange={(e) => setPriority(e.target.value as PriorityLevel)}>
              {PRIORITY_LEVELS.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            下次跟进日期
            <input
              type="date"
              value={nextFollowUpAt}
              onChange={(e) => setNextFollowUpAt(e.target.value)}
            />
          </label>
          <label className="field">
            官网进度链接
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              maxLength={1000}
            />
          </label>
        </div>
        <label className="field">
          面经 / 复盘笔记
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="记录问到的技术题、业务细节、待补充的知识点…"
            maxLength={10000}
          />
        </label>
        <div className="drawer-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || !company.trim() || !position.trim()}
            onClick={() => void saveMetadata(false)}
          >
            保存更新
          </button>
          {canUseWebCrypto() && (
            <button
              type="button"
              disabled={busy || !vaultKey}
              onClick={() => void saveMetadata(true)}
            >
              加密保存私密字段
            </button>
          )}
        </div>
      </section>
    </aside>
  );
}
