<div align="center">
  <img src="docs/assets/logo.svg" alt="OfferLine" width="56" height="56" />
  <h1>OfferLine</h1>
  <p><strong>Every application, interview, and debrief note on one clear timeline.</strong></p>
  <p>When you are juggling dozens of applications, spreadsheets rot fast and interview links get buried in your inbox.<br />OfferLine puts your application timeline, read-only email schedule parser, and Markdown interview notes into one self-hosted web app.</p>

  <p>
    <a href="README.md">简体中文</a>
    &nbsp;|&nbsp;
    <strong>English</strong>
  </p>

  <p>
    <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/Fastify-5-0f172a?style=flat-square&logo=fastify&logoColor=white" alt="Fastify 5" />
    <img src="https://img.shields.io/badge/MySQL-8.4-2563eb?style=flat-square&logo=mysql&logoColor=white" alt="MySQL 8.4" />
    <img src="https://img.shields.io/badge/Docker-Compose-0ea5e9?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose" />
    <img src="https://img.shields.io/badge/License-MIT-10b981?style=flat-square&logo=opensourceinitiative&logoColor=white" alt="MIT License" />
  </p>

  <p>
    <a href="#1-one-timeline-for-every-application">Timeline</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#2-read-only-email-listener--schedule-parser-optional">Email Listener</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#3-overview-and-markdown-interview-notes">Overview &amp; Notes</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#4-privacy--security">Security</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#5-quick-start">Quick Start</a>
    &nbsp;&nbsp;/&nbsp;&nbsp;
    <a href="#design-docs">Design Docs</a>
  </p>
</div>

<br />

<div align="center">
  <img src="docs/assets/offerline-demo.gif" alt="OfferLine Product Walkthrough" width="100%" />
</div>

---

## 1. One Timeline for Every Application

Open the Pipeline view and see where every single company stands without clicking through modals:

<img src="docs/assets/preview-pipeline.png" alt="Application Pipeline Timeline" width="100%" />

<br />

- **Multiple roles under one company**: Applied to two teams at the same company? Click `+ Add Role` to keep independent timelines stacked cleanly inside the same company card.
- **Single-click inline updates**: Every stage from Application and OA to Final Offer sits on one row. Click any dot in place to mark it passed, current, skipped, or failed.
- **Custom hiring flows per company**: Ships with Internship, Campus, and Experienced templates, and lets you add, delete, or drag-reorder stages whenever a company uses its own interview pipeline.
- **One-click portal jump with visit freshness**: Jump straight to a company's career portal and automatically refresh its last-checked badge (green within 2 days, amber at 3–5 days, orange at 6–10 days, red past 10 days) so stale portals stand out immediately.
- **Pin priorities, auto-sink closed threads**: Star top-choice companies to keep them on top; rejected or closed applications drop to the bottom automatically.
- **62 built-in company icons**: Shared company-name normalization plus 62 crisp local icons; unlisted companies fetch favicons through an SSRF-checked proxy with a clean monogram fallback.

---

## 2. Read-Only Email Listener & Schedule Parser (Optional)

Job-search inboxes are packed with OTP codes, receipts, campus livestreams, post-interview surveys, and rejection letters. Enable the optional email listener when you want schedules extracted without manual copy-paste:

<img src="docs/assets/preview-schedule.png" alt="Read-Only Email Listener and Schedule" width="100%" />

<br />

### Does it mark my unread emails as read?
No. OfferLine opens your mailbox via `imapflow` in strict `readOnly: true` mode (IMAP `EXAMINE`). It never marks unread messages as seen, and never modifies or deletes mail. Presets cover QQ Mail, 163, 126, Gmail, Outlook, Tencent Exmail, and custom IMAP servers.

### Will ads, surveys, or rejections clutter my calendar?
No. Incoming mail is stripped of `<head>/<style>/<script>`, `<a href>` links hidden behind buttons are expanded, and RFC 5545 `.ics` attachments are parsed. A zero-token local rule layer then filters out noise before anything reaches your schedule:
- Drops OTPs, billing notices, recruiting livestreams, interview experience surveys, and plain application receipts;
- **Skips rejection / process-closed emails** so they never pollute your agenda;
- Semantically deduplicates repeated reminders for the same online assessment or interview.

### Does it overwrite my pipeline stages automatically?
No. Parsed interviews and assessments land in a **Pending Confirmation** queue first. OfferLine infers the matching application record read-only without mutating your timeline or creating duplicate cards; nothing enters your calendar until you review and confirm (or tweak details side-by-side against the original email).

### Three time modes & calendar subscriptions
- Handles **scheduled** interviews, **deadline** tasks (OA / offer reply), and **flexible** self-paced assessments separately.
- Generates a private `.ics` feed compatible with Android Calendar, iOS, Feishu/Lark, and Outlook (skipping flexible items and turning deadlines into all-day reminders).

### Local rules + optional personal LLM
- Local rules work out of the box with zero token cost.
- For harder edge cases, enable the standalone **LLM Enhancement** tab with your own OpenAI-compatible API key (presets for DeepSeek, Qwen, Zhipu GLM, Kimi, OpenAI, or custom endpoints, with URL normalization and live latency testing).
- **Works without IMAP too**: You can skip IMAP credentials entirely and paste raw email text directly to parse and schedule.

---

## 3. Overview and Markdown Interview Notes

### Overview Dashboard
Shows your next confirmed interview with a live countdown, one-click meeting link, and pending email items right at the top. Before an interview starts, it surfaces prior round notes for that company; afterward, it switches to writing a debrief. The right column gives clickable conversion stats and a 7-day agenda strip.

<img src="docs/assets/preview-home.png" alt="OfferLine Overview Dashboard" width="100%" />

<br />

### Interview Notes & Sign-In
<table>
  <tr>
    <td width="50%">
      <strong>Markdown Interview Notes by Company &amp; Round</strong><br />
      <sub>WYSIWYG Markdown editor with a <code>/</code> slash command menu for headings, code blocks, checklists, and debrief templates (ignores mid-word slashes like <code>Java/Go</code> and URLs). Toggle <code>MD Source</code> anytime so your notes are never locked in.</sub>
      <br /><br />
      <img src="docs/assets/preview-notes.png" alt="Markdown Interview Notes" width="100%" />
    </td>
    <td width="50%">
      <strong>Light / Dark Themes &amp; Standalone Sign-In</strong><br />
      <sub>60fps Canvas backdrop with light and dark modes. After creating your own account on a self-hosted instance, set <code>REGISTRATION_OPEN=false</code> to lock sign-ups.</sub>
      <br /><br />
      <img src="docs/assets/preview-auth.png" alt="OfferLine Sign-In Page" width="100%" />
    </td>
  </tr>
</table>

---

## 4. Privacy & Security

- **Auth & sessions**: `crypto.scrypt` salted password hashing, `HttpOnly` + `SameSite=Lax` session cookies, same-origin CSRF enforcement, and per-route rate limiting.
- **Encrypted credentials**: IMAP app passwords and personal LLM API keys are encrypted at rest with `AES-256-GCM` and never returned in plaintext.
- **Client-side encryption**: Optional browser `WebCrypto (PBKDF2-SHA256 + AES-256-GCM)` encryption for sensitive compensation notes before upload.
- **Network isolation**: MySQL stays on a Docker `internal` network with no host port exposed; outbound icon and LLM requests block private/loopback/cloud-metadata IPs by default (set `ALLOW_LOCAL_LLM=true` to connect a local Ollama or vLLM instance).

---

## 5. Quick Start (Lightweight Local or Docker)

Choose either zero-database local Node.js startup or full Docker Compose + MySQL 8.4 deployment.

### Option 1: Let an AI Agent Install It Automatically

Paste this prompt into **Claude Code, Codex, WorkBuddy, Cursor, or Doubao**:

> Please install OfferLine (`https://github.com/milkfrogdev/offerline`) for me by following `docs/ai-install.md` using the lightweight Node.js mode (no Docker), verify the health check passes, and give me the local URL.

Full step-by-step agent runbook: **[docs/ai-install.md](docs/ai-install.md)**.

### Option 2: Lightweight Local Run (Node.js ≥ 22, No Docker or Database Needed)

```bash
git clone https://github.com/milkfrogdev/offerline.git
cd offerline
npm install
npm run build
npm start
```

Without `DATABASE_URL`, OfferLine automatically stores data in an atomic local JSON file (`./data/offerline.json`). Open `http://127.0.0.1:3002` (or `http://localhost:3002`) and register.

### Option 3: Docker Compose + MySQL 8.4 (Server Hosting)

```bash
git clone https://github.com/milkfrogdev/offerline.git
cd offerline

cat > .env << EOF
APP_ORIGIN=https://your-domain.example
ALLOW_HTTP=false
REGISTRATION_OPEN=true
MYSQL_PASSWORD=$(openssl rand -hex 20)
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 20)
MAIL_ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF

docker compose up -d --build
```

The container listens on port `3002` behind your reverse proxy (Nginx / Caddy with HTTPS).

---

## How OfferLine Compares

| Aspect | Spreadsheets | Notion Templates | Hosted Job Trackers (Huntr / Teal) | OfferLine |
|---|---|---|---|---|
| Multi-role & custom pipelines | Manual rows, hard to scan | Nested DBs, slow updates | Fixed Kanban columns | Multiple independent timelines per company card, 1-click inline updates |
| Email-to-schedule parsing | None | Needs external glue | Paid / closed-source | Built-in read-only IMAP (`EXAMINE`), zero-token local filter drops ads & rejections |
| Calendar sync | Manual | Manual | Limited | Private RFC 5545 `.ics` feed for Android, iOS, Feishu/Lark, and Outlook |
| Interview notes & portability | Poor for code/long notes | Platform-bound | Plain text boxes | WYSIWYG Markdown + `/` slash commands + raw source toggle |
| Privacy & cost | Local / cloud doc | Third-party cloud | SaaS subscription & vendor storage | MIT open-source self-hosted, encrypted secrets, optional client-side WebCrypto |

## FAQ

**What job search workflows and mail providers are supported?**
Works for internships, campus recruiting, and experienced job searches with customizable stage templates. Read-only IMAP works with QQ Mail, 163, 126, Gmail, Outlook, Tencent Exmail, and any standard IMAP server—or skip IMAP completely and paste raw email text.

**Do I need to pay for an LLM API to parse interview emails?**
No. Built-in local rules plus `.ics` attachment parsing handle standard interview and assessment emails at zero cost. Bringing your own OpenAI-compatible API key (DeepSeek, Qwen, Zhipu GLM, Kimi, OpenAI, or local Ollama) is strictly optional.

**Can I run it locally without Docker or MySQL?**
Yes. With Node.js 22+, run `npm install && npm run build && npm start`. When `DATABASE_URL` is omitted, OfferLine automatically stores data in an atomic local JSON file (`./data/offerline.json`).

---

## Design & Install Docs

- [AI Agent Auto-Install Runbook (docs/ai-install.md)](docs/ai-install.md)
- [System Architecture & Security (docs/architecture.md)](docs/architecture.md) (Chinese)
- [Email Parsing & Schedule Sync Design (docs/mail-parsing-design.md)](docs/mail-parsing-design.md) (Chinese)
- [AI Crawler & LLM Summary Index (llms.txt)](llms.txt)

## Development & Tests

```bash
npm run check   # TypeScript checks (web + server)
npm test        # Vitest unit & Fastify integration tests
npm run build   # Build dist/web and dist/server
```

## License

[MIT](LICENSE)
