import type { ScheduleEvent } from "../shared/types.js";

function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function toCstDateStamp(ms: number): string {
  const cst = new Date(ms + 8 * 3600_000);
  const y = cst.getUTCFullYear();
  const m = String(cst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(cst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function foldLine(line: string): string {
  if (line.length <= 72) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 72) {
    parts.push(rest.slice(0, 72));
    rest = ` ${rest.slice(72)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export function buildIcsCalendar(events: readonly ScheduleEvent[], calName = "OfferLine 面试日程"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OfferLine//Interview Schedule//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcsText(calName)}`),
    "X-WR-TIMEZONE:Asia/Shanghai",
  ];

  const stamp = toIcsUtc(new Date().toISOString());

  for (const ev of events) {
    if (ev.status === "dismissed") continue;
    // Do not pollute external calendars with unscheduled/flexible-time tasks
    if (ev.timeMode === "flexible") continue;

    const startMs = Date.parse(ev.startAt);
    if (Number.isNaN(startMs)) continue;

    const descParts: string[] = [];
    descParts.push(`公司：${ev.company}`);
    if (ev.position) descParts.push(`岗位：${ev.position}`);
    if (ev.stageName) descParts.push(`阶段：${ev.stageName}`);
    if (ev.location) descParts.push(`地点/链接：${ev.location}`);
    if (ev.notes) descParts.push(`备注：${ev.notes}`);
    if (ev.mailSubject) descParts.push(`原邮件：${ev.mailSubject}`);

    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${ev.id}@offerline`));
    lines.push(`DTSTAMP:${stamp}`);

    if (ev.timeMode === "deadline") {
      const dateStart = toCstDateStamp(startMs);
      const dateEnd = toCstDateStamp(startMs + 24 * 3600_000);
      lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
      lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
      lines.push(foldLine(`SUMMARY:${escapeIcsText(`[截止] ${ev.title}`)}`));
    } else {
      const endIso =
        ev.endAt && !Number.isNaN(Date.parse(ev.endAt))
          ? ev.endAt
          : new Date(startMs + 60 * 60_000).toISOString();
      lines.push(`DTSTART:${toIcsUtc(ev.startAt)}`);
      lines.push(`DTEND:${toIcsUtc(endIso)}`);
      lines.push(foldLine(`SUMMARY:${escapeIcsText(ev.title)}`));
    }

    if (ev.location) {
      lines.push(foldLine(`LOCATION:${escapeIcsText(ev.location)}`));
    }
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descParts.join("\n"))}`));
    lines.push("BEGIN:VALARM");
    lines.push(ev.timeMode === "deadline" ? "TRIGGER:-PT12H" : "TRIGGER:-PT30M");
    lines.push("ACTION:DISPLAY");
    lines.push(
      foldLine(
        `DESCRIPTION:${escapeIcsText(
          ev.timeMode === "deadline" ? `今日截止：${ev.title}` : `30 分钟后：${ev.title}`,
        )}`,
      ),
    );
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
