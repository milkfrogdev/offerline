import React from "react";
import { GITHUB_REPO_URL } from "../starPrompt";
import { IconClose, IconExternal, IconGitHub, IconStar } from "./Icons";

export function StarPromptCard({
  onStar,
  onDismiss,
}: {
  onStar: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside className="star-prompt-card" role="dialog" aria-label="支持 OfferLine 开源项目">
      <div className="star-prompt-head">
        <div className="star-prompt-title-wrap">
          <span className="star-prompt-ico" aria-hidden="true">
            <IconStar size={16} filled />
          </span>
          <h3 className="star-prompt-title">用得顺手的话，给项目点个 Star</h3>
        </div>
        <button
          type="button"
          className="icon-btn star-prompt-close"
          aria-label="关闭且不再提示"
          data-tip="关闭后不再弹出"
          onClick={onDismiss}
        >
          <IconClose size={14} />
        </button>
      </div>

      <p className="star-prompt-desc">
        你已经使用 OfferLine 超过一天了。觉得顺手的话，欢迎去 GitHub 点颗 Star 支持后续更新。
      </p>

      <div className="star-prompt-actions">
        <a
          className="btn btn-primary btn-sm star-prompt-link"
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onStar}
        >
          <IconGitHub size={14} />
          <span>去 GitHub 点 Star</span>
          <IconExternal size={12} />
        </a>
        <button type="button" className="btn btn-soft btn-sm" onClick={onDismiss}>
          不再提示
        </button>
      </div>
    </aside>
  );
}
