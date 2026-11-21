import React, { useEffect, useState } from "react";
import type {
  MailAccountPublic,
  MainTab,
  MetricFilter,
  UserProfile,
} from "../../shared/types";
import {
  IconBrand,
  IconCalendar,
  IconClose,
  IconLogout,
  IconMail,
  IconMenu,
  IconMoon,
  IconNote,
  IconPipeline,
  IconShield,
  IconSun,
} from "./Icons";

export interface SidebarMetrics {
  total: number;
  active: number;
  interviewed: number;
  offered: number;
  failed: number;
  interviewRate: number;
}

export function Sidebar({
  user,
  activeTab,
  onChangeTab,
  metrics,
  metricFilter,
  onSelectMetricFilter,
  pendingEventCount,
  upcomingEventCount,
  noteCount,
  mailConfig,
  theme,
  onToggleTheme,
  onOpenMailModal,
  onOpenVaultModal,
  onLogout,
}: {
  user: UserProfile;
  activeTab: MainTab;
  onChangeTab: (tab: MainTab) => void;
  metrics: SidebarMetrics;
  metricFilter: MetricFilter;
  onSelectMetricFilter: (filter: MetricFilter) => void;
  pendingEventCount: number;
  upcomingEventCount: number;
  noteCount: number;
  mailConfig: MailAccountPublic | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenMailModal: () => void;
  onOpenVaultModal: () => void;
  onLogout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const scheduleBadge = pendingEventCount > 0 ? pendingEventCount : upcomingEventCount;

  function selectTab(tab: MainTab) {
    onChangeTab(tab);
    setMobileOpen(false);
  }

  function handleFilterClick(f: MetricFilter) {
    onSelectMetricFilter(f);
    setMobileOpen(false);
  }

  const filterRows: { key: MetricFilter; label: string; count: number; dot: string }[] = [
    { key: "active", label: "进行中", count: metrics.active, dot: "accent" },
    { key: "interview", label: "已进面试", count: metrics.interviewed, dot: "ink" },
    { key: "offer", label: "Offer", count: metrics.offered, dot: "ok" },
    { key: "failed", label: "已挂", count: metrics.failed, dot: "muted" },
  ];

  const userInitial = (user.username.trim().slice(0, 1) || "U").toUpperCase();

  const navContent = (
    <>
      <div className="sidebar-brand">
        <button
          type="button"
          className="brand-btn"
          onClick={() => {
            onSelectMetricFilter("all");
            selectTab("pipeline");
          }}
          aria-label="OfferLine 首页"
        >
          <span className="brand-mark">
            <IconBrand size={15} />
          </span>
          <span className="brand-name">OfferLine</span>
        </button>

        <button
          type="button"
          className="sidebar-ghost-icon"
          onClick={onToggleTheme}
          title={theme === "dark" ? "切换到浅色" : "切换到深色"}
          aria-label="切换昼夜主题"
        >
          {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="主导航">
        <button
          type="button"
          className={`side-item${activeTab === "pipeline" && metricFilter === "all" ? " active" : ""}`}
          onClick={() => {
            onSelectMetricFilter("all");
            selectTab("pipeline");
          }}
        >
          <IconPipeline size={15} />
          <span className="side-item-label">全部投递</span>
          {metrics.total > 0 && <span className="side-count">{metrics.total}</span>}
        </button>

        <button
          type="button"
          className={`side-item${activeTab === "schedule" ? " active" : ""}`}
          onClick={() => selectTab("schedule")}
        >
          <IconCalendar size={15} />
          <span className="side-item-label">日程</span>
          {scheduleBadge > 0 && (
            <span className={`side-count${pendingEventCount > 0 ? " alert" : ""}`}>
              {scheduleBadge}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`side-item${activeTab === "notes" ? " active" : ""}`}
          onClick={() => selectTab("notes")}
        >
          <IconNote size={15} />
          <span className="side-item-label">面经</span>
          {noteCount > 0 && <span className="side-count">{noteCount}</span>}
        </button>
      </nav>

      {/* 无框融体状态筛选 + 极简转化率 */}
      <div className="sidebar-group">
        <div className="sidebar-group-label">状态筛选</div>
        <div className="sidebar-filters">
          {filterRows.map((row) => {
            const selected = activeTab === "pipeline" && metricFilter === row.key;
            return (
              <button
                key={row.key}
                type="button"
                className={`side-filter-row${selected ? " active" : ""}`}
                onClick={() => handleFilterClick(row.key)}
              >
                <span className={`status-pip pip-${row.dot}`} aria-hidden="true" />
                <span className="side-item-label">{row.label}</span>
                <span className="side-count">{row.count}</span>
              </button>
            );
          })}
        </div>

        <div className="sidebar-rate-inline">
          <div className="sidebar-rate-head">
            <span>进面转化</span>
            <span className="sidebar-rate-val">{metrics.interviewRate}%</span>
          </div>
          <div className="sidebar-rate-bar" aria-hidden="true">
            <div
              className="sidebar-rate-fill"
              style={{ width: `${Math.min(100, metrics.interviewRate)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="side-item"
          onClick={() => {
            setMobileOpen(false);
            onOpenMailModal();
          }}
        >
          <IconMail size={15} />
          <span className="side-item-label">邮箱监听</span>
          {mailConfig?.enabled && <span className="side-status live">运行中</span>}
        </button>

        <button
          type="button"
          className="side-item"
          onClick={() => {
            setMobileOpen(false);
            onOpenVaultModal();
          }}
        >
          <IconShield size={15} />
          <span className="side-item-label">数据与加密</span>
        </button>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <span className="user-avatar" aria-hidden="true">
              {userInitial}
            </span>
            <span className="sidebar-username" title={user.username}>
              {user.username}
            </span>
          </div>
          <button
            type="button"
            className="sidebar-ghost-icon"
            onClick={onLogout}
            title="退出登录"
            aria-label="退出登录"
          >
            <IconLogout size={14} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <header className="mobile-header">
        <div className="mobile-header-left">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航菜单"
          >
            <IconMenu size={17} />
          </button>
          <button type="button" className="brand-btn" onClick={() => selectTab("pipeline")}>
            <span className="brand-mark">
              <IconBrand size={15} />
            </span>
            <span className="brand-name">OfferLine</span>
          </button>
        </div>

        <div className="mobile-header-right">
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenMailModal}
            aria-label="邮箱监听"
          >
            <IconMail size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label="切换昼夜主题"
          >
            {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="侧边导航栏">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="drawer-backdrop" onMouseDown={() => setMobileOpen(false)}>
          <aside
            className="sidebar-drawer"
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="移动端导航"
          >
            <div className="drawer-close-row">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMobileOpen(false)}
                aria-label="关闭菜单"
              >
                <IconClose size={16} />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
