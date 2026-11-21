import React, { useEffect, useState } from "react";
import type { MailAccountPublic, MainTab, UserProfile } from "../../shared/types";
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

export function Sidebar({
  user,
  activeTab,
  onChangeTab,
  recordCount,
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
  recordCount: number;
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
  const userInitial = (user.username.trim().slice(0, 1) || "U").toUpperCase();

  function selectTab(tab: MainTab) {
    onChangeTab(tab);
    setMobileOpen(false);
  }

  const navContent = (
    <>
      <div className="sidebar-brand">
        <button
          type="button"
          className="brand-btn"
          onClick={() => selectTab("pipeline")}
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
          className={`side-item${activeTab === "pipeline" ? " active" : ""}`}
          onClick={() => selectTab("pipeline")}
        >
          <IconPipeline size={16} />
          <span className="side-item-label">投递</span>
          {recordCount > 0 && <span className="side-count">{recordCount}</span>}
        </button>

        <button
          type="button"
          className={`side-item${activeTab === "schedule" ? " active" : ""}`}
          onClick={() => selectTab("schedule")}
        >
          <IconCalendar size={16} />
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
          <IconNote size={16} />
          <span className="side-item-label">面经</span>
          {noteCount > 0 && <span className="side-count">{noteCount}</span>}
        </button>
      </nav>

      <div className="sidebar-foot">
        <button
          type="button"
          className="side-item side-item-sub"
          onClick={() => {
            setMobileOpen(false);
            onOpenMailModal();
          }}
        >
          <IconMail size={16} />
          <span className="side-item-label">邮箱监听</span>
          {mailConfig?.enabled && <span className="side-status live">运行中</span>}
        </button>

        <button
          type="button"
          className="side-item side-item-sub"
          onClick={() => {
            setMobileOpen(false);
            onOpenVaultModal();
          }}
        >
          <IconShield size={16} />
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
