import type { Task, Project } from "./types";
const cell = (value: unknown) => {
  let s = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function tasksCsv(tasks: Task[], projects: Project[]): string {
  const names = new Map(projects.map((p) => [p.id, p.name]));
  return ['title,description,status,priority,due_at,project,tags', ...tasks.map((t) => [t.title, t.description, t.status, t.priority, t.dueAt, names.get(t.projectId ?? ""), t.tags.join('; ')].map(cell).join(','))].join('\r\n');
}
const icsText = (s: string) => s.replaceAll('\\', '\\\\').replaceAll('\r\n', '\\n').replaceAll('\n', '\\n').replaceAll('\r', '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
export function tasksCalendar(tasks: Task[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Momentum//Private Tasks//EN', 'CALSCALE:GREGORIAN'];
  for (const t of tasks.filter((t) => t.dueAt && t.status !== 'done')) {
    lines.push('BEGIN:VEVENT', `UID:${t.id}@momentum.dmj.one`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(t.dueAt!)}`, `DTEND:${icsDate(new Date(new Date(t.dueAt!).getTime() + (t.effortMins ?? 30) * 60000).toISOString())}`, `SUMMARY:${icsText(t.title)}`, `DESCRIPTION:${icsText(t.description)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // Fold by UTF-8 bytes, not characters, to preserve non-ASCII task titles.
  return lines.flatMap((line) => {
    const result: string[] = []; let current = '';
    for (const char of line) { if (new TextEncoder().encode(current + char).length > 73) { result.push(current); current = ' '; } current += char; }
    result.push(current); return result;
  }).join('\r\n') + '\r\n';
}
