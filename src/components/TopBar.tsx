import type { UserProfile } from "../../shared/types";

export type ThemeChoice = "system" | "light" | "dark";

export function TopBar({
  user,
  query,
  onQuery,
  theme,
  onTheme,
  onNew,
  onOpenVault,
  onLogout,
}: {
  user: UserProfile;
  query: string;
  onQuery: (v: string) => void;
  theme: ThemeChoice;
  onTheme: (t: ThemeChoice) => void;
  onNew: () => void;
  onOpenVault: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 9h10M7 13h6M7 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>OfferLine</span>
        </div>

        <input
          className="search-input"
          aria-label="搜索公司或岗位"
          placeholder="搜索公司、岗位、城市…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />

        <div className="topbar-actions">
          <span className="segmented" role="group" aria-label="界面主题">
            {(
              [
                ["system", "自动"],
                ["light", "白天"],
                ["dark", "黑夜"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={theme === value ? "selected" : ""}
                onClick={() => onTheme(value)}
              >
                {label}
              </button>
            ))}
          </span>

          <button type="button" onClick={onOpenVault}>
            数据与安全
          </button>
          <button type="button" className="primary" onClick={onNew}>
            + 新增投递
          </button>
          <button type="button" className="quiet" onClick={onLogout} title={`@${user.username}`}>
            退出 ({user.username})
          </button>
        </div>
      </div>
    </header>
  );
}
