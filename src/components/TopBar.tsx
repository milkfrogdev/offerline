import React, { useEffect, useRef, useState } from "react";
import type { MailAccountPublic, MainTab, UserProfile } from "../../shared/types";
import {
  IconBrand,
  IconChevron,
  IconMail,
  IconMoon,
  IconShield,
  IconSun,
} from "./Icons";

export function TopBar({
  user,
  activeTab,
  onChangeTab,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const scheduleBadge = pendingEventCount > 0 ? pendingEventCount : upcomingEventCount;

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <button
            type="button"
            className="brand-btn"
            onClick={() => onChangeTab("pipeline")}
            aria-label="OfferLine 首页"
          >
            <span className="brand-mark">
              <IconBrand size={16} />
            </span>
            <span className="brand-name">OfferLine</span>
          </button>

          <nav className="main-nav" aria-label="主导航">
            <button
              type="button"
              className={`nav-link${activeTab === "pipeline" ? " active" : ""}`}
              onClick={() => onChangeTab("pipeline")}
            >
              投递
            </button>
            <button
              type="button"
              className={`nav-link${activeTab === "schedule" ? " active" : ""}`}
              onClick={() => onChangeTab("schedule")}
            >
              日程
              {scheduleBadge > 0 && (
                <span className={`nav-count${pendingEventCount > 0 ? " alert" : ""}`}>
                  {scheduleBadge}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`nav-link${activeTab === "notes" ? " active" : ""}`}
              onClick={() => onChangeTab("notes")}
            >
              面经
              {noteCount > 0 && <span className="nav-count">{noteCount}</span>}
            </button>
          </nav>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className={`icon-action${mailConfig?.enabled ? " is-live" : ""}`}
            onClick={onOpenMailModal}
            title={mailConfig?.enabled ? `邮箱监听中：${mailConfig.email}` : "配置邮箱监听"}
          >
            <IconMail size={15} />
            <span className="icon-action-label">
              {mailConfig?.enabled ? "监听中" : "邮箱监听"}
            </span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === "dark" ? "切换到浅色" : "切换到深色"}
            aria-label="切换昼夜主题"
          >
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>

          <div className="user-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="user-trigger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
            >
              <span className="user-name">{user.username}</span>
              <IconChevron size={13} />
            </button>

            {menuOpen && (
              <div className="dropdown-menu" role="menu">
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenVaultModal();
                  }}
                >
                  <IconShield size={14} />
                  <span>数据备份与加密</span>
                </button>
                <div className="dropdown-sep" />
                <button
                  type="button"
                  className="dropdown-item danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  <span>退出登录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
