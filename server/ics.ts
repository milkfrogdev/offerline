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
    const startMs = Date.parse(ev.startAt);
    if (Number.isNaN(startMs)) continue;
    const endIso =
      ev.endAt && !Number.isNaN(Date.parse(ev.endAt))
        ? ev.endAt
        : new Date(startMs + 60 * 60_000).toISOString();

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
    lines.push(`DTSTART:${toIcsUtc(ev.startAt)}`);
    lines.push(`DTEND:${toIcsUtc(endIso)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcsText(ev.title)}`));
    if (ev.location) {
      lines.push(foldLine(`LOCATION:${escapeIcsText(ev.location)}`));
    }
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descParts.join("\n"))}`));
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-PT30M");
    lines.push("ACTION:DISPLAY");
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(`30 分钟后：${ev.title}`)}`));
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
