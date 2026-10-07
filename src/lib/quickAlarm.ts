import type { Alarm } from '../types';
import { addDays, parseISO, toISO, toMinutes, weekdayName, weekday } from './dates';

/** Entende frases em português como "alarme 9h30 fazer café da manhã" ou "nove e meia toda segunda reunião". */

export interface QuickAlarm {
  time: string;
  name: string;
  days: number[];
  repeat: boolean;
  /** frase curta com o que foi entendido */
  summary: string;
  /** aviso extra (ex.: "o horário de hoje já passou") */
  note?: string;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;!?]+$/g, '');

const HOURS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};
const UNITS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const TENS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 };
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const PERIODS = new Set(['manha', 'tarde', 'noite', 'madrugada']);
const EVERY = new Set(['todo', 'toda', 'todos', 'todas']);
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Lê os minutos depois de "e": meia, quinze, trinta e cinco, 20… Devolve [minutos, tokens usados]. */
function readMinutes(nt: string[], i: number): [number, number] | null {
  const t = nt[i];
  if (t === undefined) return null;
  if (t === 'meia') return [30, 1];
  if (t === 'quinze') return [15, 1];
  if (t === 'dez') return [10, 1];
  if (/^\d{1,2}$/.test(t) && Number(t) < 60) return [Number(t), 1];
  if (t in TENS) {
    if (nt[i + 1] === 'e' && nt[i + 2] in UNITS) return [TENS[t] + UNITS[nt[i + 2]], 3];
    return [TENS[t], 1];
  }
  if (t in UNITS) return [UNITS[t], 1];
  return null;
}

export function parseQuickAlarm(input: string, now: Date = new Date()): QuickAlarm | null {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const nt = tokens.map(norm);
  const used = new Set<number>();
  const mark = (from: number, n: number) => {
    for (let k = from; k < from + n; k++) used.add(k);
  };

  // ---------- horário ----------
  let hour = -1;
  let minute = 0;
  let timeEnd = -1; // índice do último token do horário
  let m: RegExpMatchArray | null;
  for (let i = 0; i < nt.length && hour < 0; i++) {
    const t = nt[i];
    if ((m = t.match(/^(\d{1,2})[:h](\d{2})$/))) {
      hour = Number(m[1]); minute = Number(m[2]); mark(i, 1); timeEnd = i;
    } else if ((m = t.match(/^(\d{1,2})h$/))) {
      hour = Number(m[1]); mark(i, 1); timeEnd = i;
    } else if (/^\d{1,2}$/.test(t) && (nt[i - 1] === 'as' || nt[i - 1] === 'a' || nt[i + 1] === 'horas' || nt[i + 1] === 'hora' || ((nt[i + 1] === 'da' || nt[i + 1] === 'de') && PERIODS.has(nt[i + 2])))) {
      hour = Number(t); mark(i, 1); timeEnd = i;
      if (nt[i + 1] === 'horas' || nt[i + 1] === 'hora') { mark(i + 1, 1); timeEnd = i + 1; }
      if (nt[timeEnd + 1] === 'e') {
        const r = readMinutes(nt, timeEnd + 2);
        if (r) { minute = r[0]; mark(timeEnd + 1, 1 + r[1]); timeEnd += 1 + r[1]; }
      }
    } else if (t in HOURS) {
      const after = nt[i + 1];
      const hasMin = after === 'e' && readMinutes(nt, i + 2) !== null;
      const ok = nt[i - 1] === 'as' || nt[i - 1] === 'a' || after === 'horas' || after === 'hora' || hasMin || (after === 'da' && PERIODS.has(nt[i + 2]));
      if (!ok) continue;
      hour = HOURS[t]; mark(i, 1); timeEnd = i;
      if (after === 'horas' || after === 'hora') { mark(i + 1, 1); timeEnd = i + 1; }
      if (nt[timeEnd + 1] === 'e') {
        const r = readMinutes(nt, timeEnd + 2);
        if (r) { minute = r[0]; mark(timeEnd + 1, 1 + r[1]); timeEnd += 1 + r[1]; }
      }
    } else if (t === 'meio' && (nt[i + 1] === 'dia' || nt[i + 1] === 'dia')) {
      hour = 12; mark(i, 2); timeEnd = i + 1;
    } else if (t === 'meio-dia') {
      hour = 12; mark(i, 1); timeEnd = i;
    } else if ((t === 'meia' && nt[i + 1] === 'noite') ) {
      hour = 0; mark(i, 2); timeEnd = i + 1;
    } else if (t === 'meia-noite') {
      hour = 0; mark(i, 1); timeEnd = i;
    }
  }
  if (hour < 0 || hour > 23 || minute > 59) return null;
  // "às" logo antes do horário faz parte dele
  const firstTime = Math.min(...used);
  if (nt[firstTime - 1] === 'as' || nt[firstTime - 1] === 'a') used.add(firstTime - 1);
  // "da manhã/tarde/noite" colado ao horário
  if (nt[timeEnd + 1] === 'da' || nt[timeEnd + 1] === 'de') {
    const p = nt[timeEnd + 2];
    if (PERIODS.has(p)) {
      if ((p === 'tarde' || p === 'noite') && hour < 12) hour += 12;
      mark(timeEnd + 1, 2);
    }
  }

  // ---------- dias ----------
  let days: number[] = [];
  let repeat = false;
  let relative: 'hoje' | 'amanha' | 'depois' | null = null;
  for (let i = 0; i < nt.length; i++) {
    if (used.has(i)) continue;
    const t = nt[i];
    if (t === 'hoje') { relative = 'hoje'; mark(i, 1); }
    else if (t === 'depois' && nt[i + 1] === 'de' && nt[i + 2] === 'amanha') { relative = 'depois'; mark(i, 3); }
    else if (t === 'amanha') { relative = 'amanha'; mark(i, 1); }
    else if (t === 'diariamente') { days = [0, 1, 2, 3, 4, 5, 6]; repeat = true; mark(i, 1); }
    else if (EVERY.has(t) && (nt[i + 1] === 'dia' || nt[i + 1] === 'dias')) { days = [0, 1, 2, 3, 4, 5, 6]; repeat = true; mark(i, 2); }
    else if (EVERY.has(t) && nt[i + 1] === 'os' && nt[i + 2] === 'dias') { days = [0, 1, 2, 3, 4, 5, 6]; repeat = true; mark(i, 3); }
    else if (t === 'dias' && nt[i + 1] === 'uteis') { days = [1, 2, 3, 4, 5]; repeat = true; mark(i, 2); }
    else if (t === 'de' && nt[i + 1] === 'segunda' && nt[i + 2] === 'a' && nt[i + 3]?.startsWith('sexta')) { days = [1, 2, 3, 4, 5]; repeat = true; mark(i, 4); }
    else if (t === 'segunda' && nt[i + 1] === 'a' && nt[i + 2]?.startsWith('sexta')) { days = [1, 2, 3, 4, 5]; repeat = true; mark(i, 3); }
    else if ((t === 'fim' || t === 'fins') && nt[i + 1] === 'de' && nt[i + 2] === 'semana') { days = [0, 6]; repeat = true; mark(i, 3); }
  }
  const named: number[] = [];
  let plural = false;
  let every = false;
  for (let i = 0; i < nt.length; i++) {
    if (used.has(i)) continue;
    const base = nt[i].replace(/-feira$/, '').replace(/s$/, '');
    if (base in WEEKDAYS && !(nt[i] === 'sabados' && false)) {
      named.push(WEEKDAYS[base]);
      if (nt[i].endsWith('s') && !nt[i].endsWith('is')) plural = true;
      if (i > 0 && EVERY.has(nt[i - 1]) && !used.has(i - 1)) { every = true; mark(i - 1, 1); }
      mark(i, 1);
      if (nt[i + 1] === 'e' && (nt[i + 2]?.replace(/-feira$/, '').replace(/s$/, '') ?? '') in WEEKDAYS) mark(i + 1, 1);
    }
  }
  if (named.length > 0) {
    days = [...new Set(named)].sort();
    repeat = every || plural;
  }

  // ---------- quando é a próxima vez ----------
  const today = toISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const time = hhmm(hour, minute);
  let note: string | undefined;
  if (relative) {
    let target = relative === 'hoje' ? today : relative === 'amanha' ? addDays(today, 1) : addDays(today, 2);
    if (relative === 'hoje' && toMinutes(time) <= nowMin) {
      target = addDays(today, 1);
      note = 'O horário de hoje já passou, então criei para amanhã.';
    }
    days = [weekday(target)];
    repeat = false;
  }

  // ---------- nome ----------
  const dropAlarmWord = (i: number) => ['alarme', 'despertador', 'alarmes'].includes(nt[i]);
  const rest = tokens.filter((_, i) => !used.has(i) && !dropAlarmWord(i));
  const restN = rest.map(norm);
  while (restN.length && ['para', 'pra', 'de', 'que', 'e', 'a', 'as', 'o', 'me', 'as'].includes(restN[0])) { rest.shift(); restN.shift(); }
  while (restN.length && ['para', 'pra', 'de', 'e', 'as'].includes(restN[restN.length - 1])) { rest.pop(); restN.pop(); }
  let name = rest.join(' ').replace(/[\s,;:.-]+$/g, '').trim();
  name = name ? name[0].toUpperCase() + name.slice(1) : 'Alarme';

  const when = (() => {
    if (days.length === 0) return 'toca na próxima vez que der esse horário';
    if (days.length === 7) return 'todos os dias';
    if (relative === 'hoje') return 'hoje';
    if (relative === 'amanha') return `amanhã (${weekdayName(days[0]).toLowerCase()})`;
    if (relative === 'depois') return `depois de amanhã (${weekdayName(days[0]).toLowerCase()})`;
    const names = days.map((d) => weekdayName(d).toLowerCase()).join(', ');
    return repeat ? `toda semana: ${names}` : `uma vez, na próxima ${names}`;
  })();
  void parseISO;

  return { time, name, days, repeat, summary: `${time} — ${name} · ${when}`, note };
}

export function toAlarm(q: QuickAlarm, id: string): Alarm {
  return { id, time: q.time, name: q.name, days: q.days, repeat: q.repeat, enabled: true };
}
