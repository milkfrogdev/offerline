import { useCallback, useEffect, useMemo, useState } from "react";
import { groupAndSortCompanies } from "../shared/stages";
import type {
  ApplicationRecord,
  FilterStatus,
  SortMode,
  StageStatus,
  UserProfile,
  ViewMode,
} from "../shared/types";
import { api } from "./api";
import { AuthView } from "./components/AuthView";
import { DetailDrawer } from "./components/DetailDrawer";
import { CreateRecordDialog, VaultAndDataDialog } from "./components/Modals";
import { PipelineMetrics } from "./components/PipelineMetrics";
import { PipelineTable } from "./components/PipelineTable";
import { StageBoard } from "./components/StageBoard";
import { TopBar, type ThemeChoice } from "./components/TopBar";

type Toast = { id: number; text: string; kind: "ok" | "error" };

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("active");
  const [sortBy, setSortBy] = useState<SortMode>("progress");
  const [view, setView] = useState<ViewMode>("table");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultKey, setVaultKey] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      const saved = localStorage.getItem("offerline.theme");
      return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      try {
        localStorage.setItem("offerline.theme", theme);
      } catch {}
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const notify = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((old) => [...old, { id, text, kind }]);
    setTimeout(() => {
      setToasts((old) => old.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: ApplicationRecord[] }>("/records");
      setRecords(res.items);
    } catch (e) {
      notify(e instanceof Error ? e.message : "加载记录失败", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    api<{ user: UserProfile | null; registrationOpen: boolean }>("/session")
      .then((s) => {
        setUser(s.user);
        setRegistrationOpen(s.registrationOpen);
        if (s.user) void loadRecords();
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.company, r.position, r.city || "", r.source || "", r.notes || ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [records, filter, query]);

  const groups = useMemo(
    () => groupAndSortCompanies(filtered, sortBy),
    [filtered, sortBy],
  );

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedId) || null,
    [records, selectedId],
  );

  async function handleCreate(payload: Record<string, unknown>) {
    const created = await api<ApplicationRecord>("/records", payload);
    setRecords((old) => [created, ...old]);
    setSelectedId(created.id);
    notify("已新增投递记录");
  }

  async function handleUpdate(id: string, patch: Record<string, unknown>) {
    const updated = await api<ApplicationRecord>(`/records/${id}`, patch, "PATCH");
    setRecords((old) => old.map((r) => (r.id === id ? updated : r)));
  }

  async function handleStageStatus(id: string, stageIndex: number, status: StageStatus) {
    try {
      const updated = await api<ApplicationRecord>(
        `/records/${id}/stage`,
        { stageIndex, status },
        "PATCH",
      );
      setRecords((old) => old.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      notify(e instanceof Error ? e.message : "状态更新失败", "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api(`/records/${id}`, {}, "DELETE");
      setRecords((old) => old.filter((r) => r.id !== id));
      if (selectedId === id) setSelectedId(null);
      notify("记录已删除");
    } catch (e) {
      notify(e instanceof Error ? e.message : "删除失败", "error");
    }
  }

  async function handleVisitCompany(company: string, url?: string) {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    try {
      const r = await api<{ lastVisitedAt: string }>("/records/company-visit", { company });
      setRecords((old) =>
        old.map((item) =>
          item.company === company ? { ...item, lastVisitedAt: r.lastVisitedAt } : item,
        ),
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "更新访问时间失败", "error");
    }
  }

  async function handleVisitRecord(record: ApplicationRecord) {
    if (record.url) window.open(record.url, "_blank", "noopener,noreferrer");
    try {
      const r = await api<{ lastVisitedAt: string }>(`/records/${record.id}/visit`, {});
      setRecords((old) =>
        old.map((item) =>
          item.id === record.id ? { ...item, lastVisitedAt: r.lastVisitedAt } : item,
        ),
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "更新访问时间失败", "error");
    }
  }

  async function handlePinCompany(company: string, pinned: boolean) {
    try {
      await api("/records/company-pin", { company, pinned }, "PUT");
      setRecords((old) =>
        old.map((item) => (item.company === company ? { ...item, pinned } : item)),
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "置顶操作失败", "error");
    }
  }

  async function handleArchiveToggle(r: ApplicationRecord) {
    const next = r.status === "archived" ? "active" : "archived";
    try {
      await handleUpdate(r.id, { status: next });
      notify(next === "archived" ? "已归档" : "已恢复为进行中");
    } catch (e) {
      notify(e instanceof Error ? e.message : "操作失败", "error");
    }
  }

  async function handleLogout() {
    await api("/auth/logout", {});
    setUser(null);
    setRecords([]);
    setSelectedId(null);
    setVaultKey("");
  }

  if (!authReady) {
    return <div className="auth-wrap">读取中…</div>;
  }

  if (!user) {
    return (
      <AuthView
        registrationOpen={registrationOpen}
        onSuccess={(u) => {
          setUser(u);
          void loadRecords();
        }}
      />
    );
  }

  return (
    <>
      <TopBar
        user={user}
        query={query}
        onQuery={setQuery}
        theme={theme}
        onTheme={setTheme}
        onNew={() => setCreateOpen(true)}
        onOpenVault={() => setVaultOpen(true)}
        onLogout={() => void handleLogout()}
      />

      <main className="workbench">
        <PipelineMetrics records={records} />

        <div className="toolbar-row">
          <div className="toolbar-left">
            <span className="segmented" role="group" aria-label="视图切换">
              <button
                type="button"
                className={view === "table" ? "selected" : ""}
                onClick={() => setView("table")}
              >
                流水线总表
              </button>
              <button
                type="button"
                className={view === "board" ? "selected" : ""}
                onClick={() => setView("board")}
              >
                阶段看板
              </button>
            </span>

            <span className="segmented" role="group" aria-label="状态筛选">
              {(
                [
                  ["active", "进行中"],
                  ["archived", "已归档"],
                  ["all", "全部"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={filter === v ? "selected" : ""}
                  onClick={() => setFilter(v)}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>

          <div className="toolbar-right">
            <select
              aria-label="排序方式"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              style={{ width: "auto" }}
            >
              <option value="progress">按流程进度</option>
              <option value="followup">按跟进日期</option>
              <option value="visited">按最近访问</option>
              <option value="updated">按最近更新</option>
              <option value="created">按投递时间</option>
              <option value="company">按公司名称</option>
            </select>
          </div>
        </div>

        <div className={"workspace-split" + (selectedRecord ? " has-drawer" : "")}>
          <div>
            {loading && !records.length ? (
              <div className="empty-box">正在加载投递数据…</div>
            ) : !filtered.length ? (
              <div className="empty-box">
                <h2>暂无匹配的投递记录</h2>
                <button type="button" className="primary" onClick={() => setCreateOpen(true)}>
                  + 新增一条投递
                </button>
              </div>
            ) : view === "table" ? (
              <PipelineTable
                groups={groups}
                selectedId={selectedId}
                onSelect={(r) => setSelectedId(r.id)}
                onVisitCompany={(c, u) => void handleVisitCompany(c, u)}
                onPinCompany={(c, p) => void handlePinCompany(c, p)}
                onArchiveToggle={(r) => void handleArchiveToggle(r)}
              />
            ) : (
              <StageBoard
                records={filtered}
                selectedId={selectedId}
                onSelect={(r) => setSelectedId(r.id)}
              />
            )}
          </div>

          {selectedRecord && (
            <DetailDrawer
              record={selectedRecord}
              vaultKey={vaultKey}
              onClose={() => setSelectedId(null)}
              onVisit={(r) => void handleVisitRecord(r)}
              onUpdate={handleUpdate}
              onStageStatus={handleStageStatus}
              onDelete={handleDelete}
              onError={(m) => notify(m, "error")}
              onNotice={(m) => notify(m, "ok")}
            />
          )}
        </div>
      </main>

      <CreateRecordDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      <VaultAndDataDialog
        open={vaultOpen}
        records={records}
        vaultKey={vaultKey}
        onSetVaultKey={setVaultKey}
        onImported={loadRecords}
        onClose={() => setVaultOpen(false)}
        onNotice={(m) => notify(m, "ok")}
      />

      {!!toasts.length && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
