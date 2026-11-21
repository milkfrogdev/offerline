import React, { useMemo } from "react";
import type { EventKind, MailAccountPublic, ScheduleEvent } from "../../shared/types";
import { CompanyLogo } from "./CompanyLogo";
import {
  IconCalendar,
  IconCheck,
  IconDownload,
  IconExternal,
  IconMail,
  IconNote,
  IconPlus,
  IconRefresh,
  IconSpark,
  IconTrash,
} from "./Icons";

const KIND_LABELS: Record<EventKind, string> = {
  interview: "面试",
  written_test: "笔试",
  assessment: "测评",
  offer: "Offer",
  other: "跟进",
};

function formatTimeRange(startIso: string, endIso?: string): string {
  const s = new Date(startIso);
  if (Number.isNaN(s.getTime())) return startIso;
  const sh = String(s.getHours()).padStart(2, "0");
  const sm = String(s.getMinutes()).padStart(2, "0");
  if (!endIso) return `${sh}:${sm}`;
  const e = new Date(endIso);
  if (Number.isNaN(e.getTime())) return `${sh}:${sm}`;
  const eh = String(e.getHours()).padStart(2, "0");
  const em = String(e.getMinutes()).padStart(2, "0");
  return `${sh}:${sm}–${eh}:${em}`;
}

function formatDateHeading(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未定日期";
  const now = new Date();
  const todayKey = now.toDateString();
  const tomorrowKey = new Date(now.getTime() + 86400_000).toDateString();
  const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const md = `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]}`;
  if (d.toDateString() === todayKey) return `今天 · ${md}`;
  if (d.toDateString() === tomorrowKey) return `明天 · ${md}`;
  return md;
}

function formatSyncAgo(iso?: string): string {
  if (!iso) return "尚未同步";
  const diffMin = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (diffMin < 1) return "刚刚已同步";
  if (diffMin < 60) return `${diffMin} 分钟前已同步`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} 小时前已同步`;
  return `${Math.floor(h / 24)} 天前已同步`;
}

export function ScheduleView({
  events,
  mailConfig,
  syncing,
  onSyncMail,
  onOpenMailSettings,
  onOpenParseModal,
  onOpenSubscribeModal,
  onAddEvent,
  onConfirmEvent,
  onSyncEventToRecord,
  onToggleComplete,
  onDismissEvent,
  onDeleteEvent,
  onWriteNoteFromEvent,
}: {
  events: ScheduleEvent[];
  mailConfig: MailAccountPublic | null;
  syncing: boolean;
  onSyncMail: () => Promise<void>;
  onOpenMailSettings: () => void;
  onOpenParseModal: () => void;
  onOpenSubscribeModal: () => void;
  onAddEvent: () => void;
  onConfirmEvent: (event: ScheduleEvent) => Promise<void>;
  onSyncEventToRecord: (event: ScheduleEvent) => Promise<void>;
  onToggleComplete: (event: ScheduleEvent) => Promise<void>;
  onDismissEvent: (event: ScheduleEvent) => Promise<void>;
  onDeleteEvent: (event: ScheduleEvent) => Promise<void>;
  onWriteNoteFromEvent: (event: ScheduleEvent) => void;
}) {
  const pendingEvents = useMemo(
    () =>
      events
        .filter((e) => e.status === "pending_confirm")
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events],
  );

  const upcomingGroups = useMemo(() => {
    const active = events
      .filter((e) => e.status === "confirmed")
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    const map = new Map<string, { heading: string; items: ScheduleEvent[] }>();
    for (const ev of active) {
      const key = ev.startAt.slice(0, 10);
      const entry = map.get(key) || { heading: formatDateHeading(ev.startAt), items: [] };
      entry.items.push(ev);
      map.set(key, entry);
    }
    return [...map.values()];
  }, [events]);

  const completedEvents = useMemo(
    () =>
      events
        .filter((e) => e.status === "completed")
        .sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [events],
  );

  return (
    <div className="page-container">
      {/* 邮箱监听状态与日程操作条 */}
      <section className="mail-strip">
        <div className="mail-strip-info">
          <span className={`mail-status-icon${mailConfig?.enabled ? " is-live" : ""}`}>
            <IconMail size={16} />
          </span>
          <div>
            <div className="mail-strip-title">
              {mailConfig?.configured
                ? mailConfig.enabled
                  ? `邮箱自动监听中 · ${mailConfig.email}`
                  : `已配置邮箱（已暂停）· ${mailConfig.email}`
                : "连接求职邮箱，自动识别面试与笔试通知"}
            </div>
            <div className="mail-strip-sub">
              {mailConfig?.configured
                ? mailConfig.lastError
                  ? `上次同步异常：${mailConfig.lastError}`
                  : `每 ${mailConfig.pollIntervalMin} 分钟检查一次 · ${formatSyncAgo(mailConfig.lastSyncedAt)}`
                : "支持 QQ、163、Gmail 与企业邮箱 IMAP 授权接入，也可以直接粘贴一封邮件即时解析生成日程"}
            </div>
          </div>
        </div>

        <div className="mail-strip-actions">
          {mailConfig?.configured && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={syncing}
              onClick={() => void onSyncMail()}
            >
              <IconRefresh size={14} />
              <span>{syncing ? "同步中…" : "立即同步"}</span>
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onOpenParseModal}>
            <IconSpark size={14} />
            <span>粘贴邮件解析</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenSubscribeModal}>
            <IconCalendar size={14} />
            <span>日历订阅</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenMailSettings}>
            <IconMail size={14} />
            <span>邮箱设置</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onAddEvent}>
            <IconPlus size={14} />
            <span>新建日程</span>
          </button>
        </div>
      </section>

      {/* 待确认的邮箱新发现 */}
      {pendingEvents.length > 0 && (
        <section className="schedule-section">
          <div className="section-head">
            <h2 className="section-title">邮箱新发现 · 待确认</h2>
            <span className="section-meta">{pendingEvents.length} 条</span>
          </div>

          <div className="event-card-list">
            {pendingEvents.map((ev) => (
              <article key={ev.id} className="event-card is-pending">
                <div className="event-main">
                  <CompanyLogo company={ev.company} size="md" />
                  <div className="event-body">
                    <div className="event-title-row">
                      <span className="event-title">{ev.title}</span>
                      <span className="event-kind">{KIND_LABELS[ev.kind]}</span>
                      <span className="event-source">来自邮箱</span>
                    </div>
                    <div className="event-meta-row">
                      <span className="event-time">
                        {formatDateHeading(ev.startAt)} {formatTimeRange(ev.startAt, ev.endAt)}
                      </span>
                      {ev.location && (
                        /^https?:\/\//i.test(ev.location) ? (
                          <a
                            href={ev.location}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="meta-link"
                          >
                            <span>会议/笔试链接</span>
                            <IconExternal size={12} />
                          </a>
                        ) : (
                          <span className="event-loc">{ev.location}</span>
                        )
                      )}
                    </div>
                    {ev.mailSubject && (
                      <div className="event-snippet">原邮件：{ev.mailSubject}</div>
                    )}
                  </div>
                </div>

                <div className="event-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void onSyncEventToRecord(ev)}
                  >
                    确认并同步进度
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void onConfirmEvent(ev)}
                  >
                    仅加入日程
                  </button>
                  <button
                    type="button"
                    className="btn-text-muted"
                    onClick={() => void onDismissEvent(ev)}
                  >
                    忽略
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 即将到来的日程时间轴 */}
      <section className="schedule-section">
        <div className="section-head">
          <h2 className="section-title">即将到来</h2>
          <span className="section-meta">
            {upcomingGroups.reduce((acc, g) => acc + g.items.length, 0)} 场
          </span>
        </div>

        {upcomingGroups.length === 0 ? (
          <div className="empty-panel compact">
            <p className="empty-title">暂无待办面试或笔试日程</p>
            <p className="empty-desc">
              开启邮箱监听后，收到的笔试与面试通知会自动归集到这里，也可以粘贴一封邀约邮件立即解析。
            </p>
          </div>
        ) : (
          <div className="day-groups">
            {upcomingGroups.map((group) => (
              <div key={group.heading} className="day-group">
                <div className="day-heading">{group.heading}</div>
                <div className="event-card-list">
                  {group.items.map((ev) => (
                    <article key={ev.id} className="event-card">
                      <div className="event-main">
                        <div className="event-clock">{formatTimeRange(ev.startAt, ev.endAt)}</div>
                        <CompanyLogo company={ev.company} size="md" />
                        <div className="event-body">
                          <div className="event-title-row">
                            <span className="event-title">{ev.title}</span>
                            <span className="event-kind">{KIND_LABELS[ev.kind]}</span>
                            {ev.source === "email" && <span className="event-source">邮箱同步</span>}
                          </div>
                          <div className="event-meta-row">
                            {ev.position && <span>{ev.position}</span>}
                            {ev.location && (
                              /^https?:\/\//i.test(ev.location) ? (
                                <a
                                  href={ev.location}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="meta-link"
                                >
                                  <span>进入会议/笔试</span>
                                  <IconExternal size={12} />
                                </a>
                              ) : (
                                <span className="event-loc">{ev.location}</span>
                              )
                            )}
                          </div>
                          {ev.notes && <div className="event-snippet">{ev.notes}</div>}
                        </div>
                      </div>

                      <div className="event-actions">
                        {!ev.syncedToRecord && (
                          <button
                            type="button"
                            className="subtle-btn"
                            onClick={() => void onSyncEventToRecord(ev)}
                            title="同步推进对应岗位的面试进度"
                          >
                            同步进度
                          </button>
                        )}
                        <a
                          href={`/api/events/${encodeURIComponent(ev.id)}/ics`}
                          className="row-icon-btn"
                          title="导出 .ics 到系统日历"
                          aria-label="导出日历文件"
                        >
                          <IconDownload size={14} />
                        </a>
                        <button
                          type="button"
                          className="row-icon-btn"
                          onClick={() => onWriteNoteFromEvent(ev)}
                          title="面后写面经"
                          aria-label="写面经"
                        >
                          <IconNote size={14} />
                        </button>
                        <button
                          type="button"
                          className="row-icon-btn"
                          onClick={() => void onToggleComplete(ev)}
                          title="标记已完成"
                          aria-label="标记已完成"
                        >
                          <IconCheck size={14} />
                        </button>
                        <button
                          type="button"
                          className="row-icon-btn danger"
                          onClick={() => void onDeleteEvent(ev)}
                          title="删除日程"
                          aria-label="删除日程"
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 已完成 */}
      {completedEvents.length > 0 && (
        <section className="schedule-section is-muted">
          <div className="section-head">
            <h2 className="section-title">已完成</h2>
            <span className="section-meta">{completedEvents.length} 场</span>
          </div>
          <div className="event-card-list">
            {completedEvents.map((ev) => (
              <article key={ev.id} className="event-card is-done">
                <div className="event-main">
                  <div className="event-clock">{ev.startAt.slice(5, 10)}</div>
                  <CompanyLogo company={ev.company} size="sm" />
                  <div className="event-body">
                    <div className="event-title-row">
                      <span className="event-title">{ev.title}</span>
                      <span className="event-kind">{KIND_LABELS[ev.kind]}</span>
                    </div>
                  </div>
                </div>
                <div className="event-actions">
                  <button
                    type="button"
                    className="subtle-btn"
                    onClick={() => onWriteNoteFromEvent(ev)}
                  >
                    <IconNote size={13} />
                    <span>补面经</span>
                  </button>
                  <button
                    type="button"
                    className="row-icon-btn danger"
                    onClick={() => void onDeleteEvent(ev)}
                    title="删除"
                    aria-label="删除日程"
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
