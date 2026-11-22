import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MailAccountPublic, MainTab, UserProfile } from "../../shared/types";
import {
  IconBrand,
  IconCalendar,
  IconClose,
  IconHome,
  IconLogout,
  IconMail,
  IconMenu,
  IconMoon,
  IconNote,
  IconPipeline,
  IconShield,
  IconSun,
} from "./Icons";

const NAV_ORDER: MainTab[] = ["home", "pipeline", "schedule", "notes"];

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
  const desktopNavRef = useRef<HTMLElement>(null);
  const [pillGeom, setPillGeom] = useState<{ top: number; height: number; ready: boolean }>({
    top: 0,
    height: 40,
    ready: false,
  });

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useLayoutEffect(() => {
    const nav = desktopNavRef.current;
    if (!nav) return;
    const measure = () => {
      const idx = Math.max(0, NAV_ORDER.indexOf(activeTab));
      const buttons = nav.querySelectorAll<HTMLButtonElement>("button.side-item");
      const target = buttons[idx];
      if (!target) return;
      setPillGeom({
        top: target.offsetTop,
        height: target.offsetHeight,
        ready: true,
      });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(nav);
      return () => ro.disconnect();
    }
    return undefined;
  }, [activeTab]);

  const scheduleBadge = pendingEventCount > 0 ? pendingEventCount : upcomingEventCount;
  const userInitial = (user.username.trim().slice(0, 1) || "U").toUpperCase();

  function selectTab(tab: MainTab) {
    onChangeTab(tab);
    setMobileOpen(false);
  }

  function renderNavContent(isDesktop: boolean) {
    return (
      <>
        <div className="sidebar-brand">
          <button
            type="button"
            className="brand-btn"
            onClick={() => selectTab("home")}
            aria-label="OfferLine 概览主页"
          >
            <span className="brand-mark">
              <IconBrand size={15} />
            </span>
            <span className="brand-name">OfferLine</span>
          </button>

          <button
            type="button"
            className="sidebar-ghost-icon theme-toggle-btn"
            onClick={onToggleTheme}
            data-tip={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            data-tip-pos="bottom"
            aria-label="切换昼夜主题"
          >
            <span key={theme} className="theme-icon-swap">
              {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
            </span>
          </button>
        </div>

        <nav
          ref={isDesktop ? desktopNavRef : undefined}
          className="sidebar-nav"
          aria-label="主导航"
        >
          {isDesktop && (
            <span
              className={`sidebar-active-pill${pillGeom.ready ? " is-ready" : ""}`}
              style={{
                transform: `translate3d(0, ${pillGeom.top}px, 0)`,
                height: `${pillGeom.height}px`,
              }}
              aria-hidden="true"
            />
          )}

          <button
            type="button"
            className={`side-item${activeTab === "home" ? " active" : ""}`}
            onClick={() => selectTab("home")}
          >
            <span className="side-item-ico">
              <IconHome size={16} />
            </span>
            <span className="side-item-label">概览</span>
          </button>

          <button
            type="button"
            className={`side-item${activeTab === "pipeline" ? " active" : ""}`}
            onClick={() => selectTab("pipeline")}
          >
            <span className="side-item-ico">
              <IconPipeline size={16} />
            </span>
            <span className="side-item-label">投递</span>
            {recordCount > 0 && <span className="side-count">{recordCount}</span>}
          </button>

          <button
            type="button"
            className={`side-item${activeTab === "schedule" ? " active" : ""}`}
            onClick={() => selectTab("schedule")}
          >
            <span className="side-item-ico">
              <IconCalendar size={16} />
            </span>
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
            <span className="side-item-ico">
              <IconNote size={16} />
            </span>
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
            <span className="side-item-ico">
              <IconMail size={16} />
            </span>
            <span className="side-item-label">邮箱监听</span>
            {mailConfig?.enabled && (
              <span className="side-status live">
                <span className="live-pulse-ring" aria-hidden="true" />
                运行中
              </span>
            )}
          </button>

          <button
            type="button"
            className="side-item side-item-sub"
            onClick={() => {
              setMobileOpen(false);
              onOpenVaultModal();
            }}
          >
            <span className="side-item-ico">
              <IconShield size={16} />
            </span>
            <span className="side-item-label">数据与加密</span>
          </button>

          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <span className="user-avatar" aria-hidden="true">
                {userInitial}
              </span>
              <span className="sidebar-username">
                {user.username}
              </span>
            </div>
            <button
              type="button"
              className="sidebar-ghost-icon"
              onClick={onLogout}
              data-tip="退出登录"
              aria-label="退出登录"
            >
              <IconLogout size={14} />
            </button>
          </div>
        </div>
      </>
    );
  }

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
          <button type="button" className="brand-btn" onClick={() => selectTab("home")}>
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
        {renderNavContent(true)}
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
            {renderNavContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
