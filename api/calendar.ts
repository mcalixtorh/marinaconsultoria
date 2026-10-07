/**
 * Google Agenda → Central de Rotina (somente leitura), pelo endereço secreto iCal.
 *
 * Lê o calendário, expande eventos que se repetem e devolve uma lista simples de
 * eventos (data/horário já no fuso de São Paulo). Quem junta isso aos dados do app
 * é src/lib/gcal.ts. Nada aqui grava no Google nem altera dados.
 *
 * Variáveis de ambiente (Vercel): ICAL_URL (o endereço secreto) e ASSISTANT_PASSCODE.
 * O endereço NUNCA vai para o navegador: só esta função o conhece.
 */
import { timingSafeEqual } from 'node:crypto';
import * as rruleNs from 'rrule';

type RRuleLib = typeof import('rrule');
// rrule é CommonJS: no Node ESM os exports nomeados podem não existir, mas o default sim
const rr: RRuleLib = ((rruleNs as unknown as { default?: RRuleLib }).default ?? rruleNs) as RRuleLib;

const TARGET_TZ = 'America/Sao_Paulo';
const PAST_DAYS = 14;
const FUTURE_DAYS = 120;
const MAX_BYTES = 8 * 1024 * 1024;

export interface CalEvent {
  /** estável entre atualizações: gcal-<uid>[-<data original>] */
  id: string;
  title: string;
  description: string;
  location: string;
  /** AAAA-MM-DD no fuso de São Paulo */
  date: string;
  /** HH:MM, vazio em eventos de dia inteiro */
  time: string;
  end: string;
  link: string;
  allDay: boolean;
}

// ---------------------------------------------------------------- ICS básico
interface Prop { name: string; params: Record<string, string>; value: string }
interface RawEvent { props: Prop[] }

const LINE = /^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^:;"]*))*):(.*)$/;

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
}

export function readEvents(ics: string): RawEvent[] {
  const lines = ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = { props: [] };
    else if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
      const m = LINE.exec(line);
      if (!m) continue;
      const params: Record<string, string> = {};
      for (const p of m[2].split(';').filter(Boolean)) {
        const i = p.indexOf('=');
        params[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, '');
      }
      cur.props.push({ name: m[1].toUpperCase(), params, value: m[3] });
    }
  }
  return events;
}

const first = (e: RawEvent, name: string) => e.props.find((p) => p.name === name);

interface Dt { y: number; mo: number; d: number; h: number; mi: number; tz: string | null; allDay: boolean }

function parseDt(p: Prop): Dt | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(p.value.trim());
  if (!m) return null;
  const allDay = m[4] === undefined || p.params.VALUE === 'DATE';
  return { y: +m[1], mo: +m[2], d: +m[3], h: allDay ? 0 : +m[4], mi: allDay ? 0 : +m[5], tz: m[7] ? 'UTC' : p.params.TZID ?? null, allDay };
}

// ---------------------------------------------------------------- fusos horários
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

function validTz(tz: string | null): string {
  if (!tz) return TARGET_TZ;
  try {
    fmt(tz);
    return tz;
  } catch {
    return TARGET_TZ; // fuso desconhecido: assume o de São Paulo
  }
}

function tzParts(ts: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(ts))) if (p.type !== 'literal') o[p.type] = +p.value;
  return { y: o.year, mo: o.month, d: o.day, h: o.hour, mi: o.minute };
}

/** Relógio de parede em `tz` → instante (ms desde 1970). */
function wallToInstant(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = tzParts(guess, tz);
    guess = wall - (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - guess);
  }
  return guess;
}

function dtInstant(dt: Dt): number {
  return dt.tz === 'UTC' ? Date.UTC(dt.y, dt.mo - 1, dt.d, dt.h, dt.mi) : wallToInstant(dt.y, dt.mo, dt.d, dt.h, dt.mi, validTz(dt.tz));
}

const p2 = (n: number) => String(n).padStart(2, '0');
function local(ts: number) {
  const p = tzParts(ts, TARGET_TZ);
  return { date: `${p.y}-${p2(p.mo)}-${p2(p.d)}`, time: `${p2(p.h)}:${p2(p.mi)}` };
}
const dateOnly = (dt: Dt) => `${dt.y}-${p2(dt.mo)}-${p2(dt.d)}`;

// ---------------------------------------------------------------- expansão
function meetLink(...texts: string[]): string {
  for (const t of texts) {
    const m = /https:\/\/meet\.google\.com\/[a-z0-9-]+/i.exec(t);
    if (m) return m[0];
  }
  return '';
}

export function expandEvents(ics: string, now: number): { events: CalEvent[]; from: string; to: string } {
  const todayLocal = local(now).date;
  const [ty, tm, td] = todayLocal.split('-').map(Number);
  const from = local(Date.UTC(ty, tm - 1, td - PAST_DAYS, 12)).date;
  const to = local(Date.UTC(ty, tm - 1, td + FUTURE_DAYS, 12)).date;
  const raws = readEvents(ics);
  const out = new Map<string, CalEvent>();

  // exceções de eventos repetidos: uid + instante original
  const overrides = new Map<string, RawEvent>();
  for (const e of raws) {
    const rid = first(e, 'RECURRENCE-ID');
    const uid = first(e, 'UID')?.value;
    const dt = rid && parseDt(rid);
    if (uid && dt) overrides.set(`${uid}|${dtInstant(dt)}`, e);
  }

  const emit = (e: RawEvent, dtstart: Dt, startInstant: number, idKey: string) => {
    if (first(e, 'STATUS')?.value.toUpperCase() === 'CANCELLED') return;
    const uid = first(e, 'UID')?.value ?? '';
    const endProp = first(e, 'DTEND');
    const dtend = endProp ? parseDt(endProp) : null;
    const description = unescapeText(first(e, 'DESCRIPTION')?.value ?? '').replace(/<[^>]+>/g, '');
    const location = unescapeText(first(e, 'LOCATION')?.value ?? '');
    const conf = first(e, 'X-GOOGLE-CONFERENCE')?.value ?? '';
    const link = meetLink(conf, description, location);
    let date: string, time = '', end = '';
    if (dtstart.allDay) date = dateOnly(dtstart);
    else {
      const l = local(startInstant);
      date = l.date;
      time = l.time;
      if (dtend && !dtend.allDay) end = local(startInstant + (dtInstant(dtend) - dtInstant(dtstart))).time;
    }
    if (date < from || date > to) return;
    const id = `gcal-${uid}${idKey ? `-${idKey}` : ''}`;
    out.set(id, { id, title: unescapeText(first(e, 'SUMMARY')?.value ?? '(sem título)').trim() || '(sem título)', description: description.trim(), location, date, time, end, link, allDay: dtstart.allDay });
  };

  for (const e of raws) {
    const uid = first(e, 'UID')?.value;
    const startProp = first(e, 'DTSTART');
    const dtstart = startProp && parseDt(startProp);
    if (!uid || !dtstart) continue;

    const rid = first(e, 'RECURRENCE-ID');
    if (rid) {
      // exceção: já tem os próprios horários; o id segue o dia ORIGINAL para continuar o mesmo item
      const orig = parseDt(rid);
      if (orig) emit(e, dtstart, dtInstant(dtstart), dtstart.allDay ? dateOnly(orig) : local(dtInstant(orig)).date.replace(/-/g, '') + local(dtInstant(orig)).time.replace(':', ''));
      continue;
    }

    const rule = first(e, 'RRULE');
    if (!rule) {
      emit(e, dtstart, dtInstant(dtstart), '');
      continue;
    }

    // repetição: expande em "relógio de parede" (como UTC) e converte cada ocorrência
    const tz = dtstart.tz === 'UTC' ? 'UTC' : validTz(dtstart.tz);
    let rrule: InstanceType<RRuleLib['RRule']>;
    try {
      rrule = new rr.RRule({ ...rr.RRule.parseString(rule.value), dtstart: new Date(Date.UTC(dtstart.y, dtstart.mo - 1, dtstart.d, dtstart.h, dtstart.mi)) });
    } catch {
      emit(e, dtstart, dtInstant(dtstart), ''); // regra que não entendi: mostra só a primeira
      continue;
    }
    const excluded = new Set<number>();
    for (const p of e.props.filter((x) => x.name === 'EXDATE')) {
      for (const v of p.value.split(',')) {
        const dt = parseDt({ ...p, value: v });
        if (dt) excluded.add(dt.allDay ? Date.UTC(dt.y, dt.mo - 1, dt.d) : dtInstant(dt));
      }
    }
    const lo = new Date(Date.UTC(ty, tm - 1, td - PAST_DAYS - 2));
    const hi = new Date(Date.UTC(ty, tm - 1, td + FUTURE_DAYS + 2, 23, 59));
    for (const occ of rrule.between(lo, hi, true)) {
      const y = occ.getUTCFullYear(), mo = occ.getUTCMonth() + 1, d = occ.getUTCDate(), h = occ.getUTCHours(), mi = occ.getUTCMinutes();
      const instant = dtstart.allDay ? Date.UTC(y, mo - 1, d) : tz === 'UTC' ? Date.UTC(y, mo - 1, d, h, mi) : wallToInstant(y, mo, d, h, mi, tz);
      if (excluded.has(instant)) continue;
      if (overrides.has(`${uid}|${instant}`)) continue; // a exceção é emitida à parte
      const key = dtstart.allDay ? `${y}-${p2(mo)}-${p2(d)}` : local(instant).date.replace(/-/g, '') + local(instant).time.replace(':', '');
      emit(e, { ...dtstart, y, mo, d, h, mi }, instant, key);
    }
  }
  const events = [...out.values()].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
  return { events, from, to };
}

// ---------------------------------------------------------------- função HTTP
interface Req { method?: string; headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): Res; setHeader(name: string, value: string): void; json(body: unknown): void }

const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 40;
}
const header = (req: Req, n: string) => { const v = req.headers[n]; return (Array.isArray(v) ? v[0] : v) ?? ''; };
function samePass(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return void res.status(405).json({ error: 'Método não permitido.' });
  const pass = process.env.ASSISTANT_PASSCODE;
  const url = process.env.ICAL_URL;
  if (!pass || !url) return void res.status(503).json({ code: 'not_configured', error: 'A leitura do Google Agenda ainda não foi ativada neste app.' });
  if (!samePass(header(req, 'x-passcode'), pass)) return void res.status(401).json({ code: 'bad_passcode', error: 'Senha incorreta.' });
  const ip = header(req, 'x-forwarded-for').split(',')[0].trim() || 'sem-ip';
  if (limited(ip)) return void res.status(429).json({ error: 'Muitas atualizações em pouco tempo. Espere alguns minutos.' });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return void res.status(500).json({ code: 'bad_url', error: 'O endereço configurado em ICAL_URL não é um link válido.' });
  }
  if (target.protocol !== 'https:' || target.hostname !== 'calendar.google.com') {
    return void res.status(500).json({ code: 'bad_url', error: 'ICAL_URL precisa ser o endereço secreto do Google Agenda (calendar.google.com).' });
  }
  try {
    const r = await fetch(target, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return void res.status(502).json({ error: `O Google respondeu ${r.status}. O endereço secreto pode ter sido redefinido.` });
    const text = await r.text();
    if (text.length > MAX_BYTES) return void res.status(502).json({ error: 'O calendário é grande demais para ler.' });
    if (!text.includes('BEGIN:VCALENDAR')) return void res.status(502).json({ error: 'O endereço não devolveu um calendário. Confira se é o "endereço secreto no formato iCal".' });
    const { events, from, to } = expandEvents(text, Date.now());
    return void res.status(200).json({ events, window: { from, to }, fetchedAt: Date.now() });
  } catch (e) {
    console.error('calendário: falha ao ler', e instanceof Error ? e.name : String(e)); // nunca registra o endereço
    return void res.status(502).json({ error: 'Não consegui ler o Google Agenda agora.' });
  }
}
