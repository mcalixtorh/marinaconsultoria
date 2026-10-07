const pad = (n: number) => String(n).padStart(2, '0');

/** Data local em AAAA-MM-DD (sem passar por UTC). */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function diffDays(a: string, b: string): number {
  const ms = Date.UTC(...ymd(a)) - Date.UTC(...ymd(b));
  return Math.round(ms / 86400000);
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m - 1, d];
}

export function weekday(iso: string): number {
  return parseISO(iso).getDay();
}

export function startOfWeek(iso: string): string {
  // semana começa na segunda-feira
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01';
}

export function daysInMonth(iso: string): number {
  const d = parseISO(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** "HH:MM" → minutos desde 00:00 */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function nowMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Momento exato (ms) de uma data + horário locais. */
export function toTimestamp(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const weekdayName = (i: number) => WEEKDAYS[i];
export const weekdayShort = (i: number) => WEEKDAYS_SHORT[i];
export const monthName = (i: number) => MONTHS[i];

/** "Quarta-feira, 07 de outubro" */
export function longDate(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())} de ${MONTHS[d.getMonth()]}`;
}

/** "07/10" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** "Hoje", "Amanhã", "Ontem" ou "qua, 07/10" */
export function relativeDay(iso: string, today: string): string {
  const diff = diffDays(iso, today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return `${WEEKDAYS_SHORT[weekday(iso)]}, ${shortDate(iso)}`;
}

export function greeting(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}
