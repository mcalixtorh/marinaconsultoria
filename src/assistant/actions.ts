import type { Alarm, AppState, Item, Kind, Prio, Recur, RecurType, RecurUnit, Status } from '../types';
import { longDate, parseISO, shortDate, toISO, weekdayName } from '../lib/dates';
import { NO_RECUR, describeRecur, isRecurring } from '../lib/recurrence';
import { isDoneOn, toggleDone } from '../lib/tasks';

/**
 * Ações que o assistente pode pedir. A IA só PROPÕE: tudo passa por planActions
 * (validação) antes de qualquer mudança, e apagar sempre pede confirmação.
 */
export type AssistantAction =
  | { type: 'create_item'; title: string; date?: string; time?: string; kind?: Kind; category?: string; priority?: Prio; reminders_minutes?: number[]; description?: string; person?: string; recurrence?: { type: RecurType; weekdays?: number[]; n?: number; unit?: RecurUnit } }
  | { type: 'update_item'; id: string; title?: string; date?: string; time?: string; kind?: Kind; category?: string; priority?: Prio; status?: Status; reminders_minutes?: number[]; description?: string; person?: string }
  | { type: 'complete_item'; id: string; date?: string; done?: boolean }
  | { type: 'delete_item'; id: string }
  | { type: 'create_alarm'; time: string; name?: string; days?: number[]; repeat?: boolean }
  | { type: 'delete_alarm'; id: string }
  | { type: 'add_note'; text: string };

export interface Plan {
  actions: AssistantAction[];
  /** o que vai acontecer, em português */
  lines: string[];
  /** avisos importantes (ex.: o evento continua no Google Agenda) */
  warnings: string[];
  /** pedidos que não consegui validar (id inexistente, data inválida…) */
  problems: string[];
  /** true se há algo que apaga: exige confirmação */
  destructive: boolean;
}

const KINDS: Kind[] = ['tarefa', 'compromisso', 'lembrete'];
const PRIOS: Prio[] = ['baixa', 'media', 'alta', 'urgente'];
const STATUSES: Status[] = ['pendente', 'andamento', 'concluido'];
const RECUR_TYPES: RecurType[] = ['none', 'daily', 'weekly', 'monthly', 'month_first', 'custom'];
const RECUR_UNITS: RecurUnit[] = ['day', 'week', 'month'];
const REMINDERS = [1440, 180, 60, 30, 10, 0];
const KIND_LABEL: Record<Kind, string> = { tarefa: 'tarefa', compromisso: 'compromisso', lembrete: 'lembrete' };

const isStr = (v: unknown): v is string => typeof v === 'string';
const validDate = (s: unknown): s is string => isStr(s) && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
const validTime = (s: unknown): s is string => isStr(s) && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const clean = (s: string, max = 200) => s.replace(/\s+/g, ' ').trim().slice(0, max);
const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Texto compacto do que o app tem, para a IA saber o que existe (sem descrições longas). */
export function buildContext(state: AppState, now: Date): string {
  const today = toISO(now);
  const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const lo = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14));
  const hi = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90));
  const cat = (id: string) => state.categories.find((c) => c.id === id)?.name ?? id;
  const rows = state.items
    .filter((i) => (i.date === '' ? i.status !== 'concluido' : i.date >= lo && i.date <= hi))
    .slice(0, 200)
    .map((i) => {
      const st = isRecurring(i) ? `repete: ${describeRecur(i.recur)}` : i.status;
      return [i.id, i.kind, i.date || 'sem data', i.time || '-', st, cat(i.cat), clean(i.title, 120), clean(i.person ?? '', 60) || '-'].join(' | ');
    });
  const alarms = state.alarms.map((a) => [a.id, a.time, a.days.length ? a.days.join(',') : 'próxima vez', a.repeat ? 'repete' : 'uma vez', a.enabled ? 'ativo' : 'desativado', clean(a.name, 60)].join(' | '));
  return [
    `HOJE: ${today} (${weekdayName(parseISO(today).getDay())}), agora são ${hh}.`,
    `CATEGORIAS (id=nome): ${state.categories.map((c) => `${c.id}=${c.name}`).join('; ')}`,
    `ITENS (id | tipo | data | hora | situação | categoria | título | pessoa):`,
    ...(rows.length ? rows : ['(nenhum)']),
    `ALARMES (id | hora | dias da semana 0=domingo | repetição | estado | nome):`,
    ...(alarms.length ? alarms : ['(nenhum)']),
  ].join('\n');
}

function normalizeRecur(r: unknown): Recur | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  if (!RECUR_TYPES.includes(o.type as RecurType)) return null;
  const weekdays = Array.isArray(o.weekdays) ? [...new Set(o.weekdays.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort() : [];
  const n = Number.isInteger(o.n) && (o.n as number) >= 1 && (o.n as number) <= 365 ? (o.n as number) : 1;
  const unit = RECUR_UNITS.includes(o.unit as RecurUnit) ? (o.unit as RecurUnit) : 'week';
  return { type: o.type as RecurType, weekdays, n, unit };
}

function normalizeReminders(v: unknown): number[] {
  return Array.isArray(v) ? [...new Set(v.filter((m): m is number => REMINDERS.includes(m as number)))].sort((a, b) => b - a) : [];
}

const when = (date: string, time: string) => [date ? shortDate(date) : 'sem data', time].filter(Boolean).join(' ');
const hhmm = (t: string) => t;

/** Valida o que a IA pediu contra os dados reais e descreve o que vai acontecer. */
export function planActions(state: AppState, raw: unknown, today: string): Plan {
  const plan: Plan = { actions: [], lines: [], warnings: [], problems: [], destructive: false };
  const list = Array.isArray(raw) ? raw.slice(0, 20) : [];
  const catOk = (id: unknown): id is string => isStr(id) && state.categories.some((c) => c.id === id);
  // itens já apagados por uma ação anterior deste mesmo comando não podem ser alterados de novo
  const gone = new Set<string>();

  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const a = r as Record<string, unknown>;
    const findItem = (): Item | null => {
      const it = isStr(a.id) ? state.items.find((i) => i.id === a.id) : undefined;
      if (!it || gone.has(it.id)) {
        plan.problems.push(`Não encontrei o item "${isStr(a.id) ? a.id : '?'}".`);
        return null;
      }
      return it;
    };

    switch (a.type) {
      case 'create_item': {
        const title = isStr(a.title) ? clean(a.title) : '';
        if (!title) { plan.problems.push('Faltou o título de um item novo.'); break; }
        if (a.date !== undefined && a.date !== '' && !validDate(a.date)) { plan.problems.push(`Data inválida para "${title}".`); break; }
        if (a.time !== undefined && a.time !== '' && !validTime(a.time)) { plan.problems.push(`Horário inválido para "${title}".`); break; }
        const date = isStr(a.date) ? a.date : '';
        const time = isStr(a.time) ? a.time : '';
        const kind: Kind = KINDS.includes(a.kind as Kind) ? (a.kind as Kind) : time ? 'compromisso' : 'tarefa';
        const recur = normalizeRecur(a.recurrence) ?? { ...NO_RECUR };
        if (recur.type !== 'none' && !date) { plan.problems.push(`Para repetir "${title}" preciso da data de início.`); break; }
        const fallbackCat = state.categories.find((c) => c.id === 'compromissos')?.id ?? state.categories[0]?.id ?? 'rs';
        const act: AssistantAction = {
          type: 'create_item', title, date, time, kind,
          category: catOk(a.category) ? a.category : fallbackCat,
          priority: PRIOS.includes(a.priority as Prio) ? (a.priority as Prio) : 'media',
          reminders_minutes: time ? normalizeReminders(a.reminders_minutes) : [],
          description: isStr(a.description) ? clean(a.description, 2000) : '',
          person: isStr(a.person) ? clean(a.person, 80) : '',
          recurrence: recur,
        };
        plan.actions.push(act);
        plan.lines.push(`Criar ${KIND_LABEL[kind]}: "${title}" — ${when(date, time)}${recur.type !== 'none' ? ` (${describeRecur(recur).toLowerCase()})` : ''}`);
        break;
      }
      case 'update_item': {
        const it = findItem();
        if (!it) break;
        const ch: string[] = [];
        const act: Extract<AssistantAction, { type: 'update_item' }> = { type: 'update_item', id: it.id };
        if (isStr(a.title) && clean(a.title)) { act.title = clean(a.title); ch.push(`título "${act.title}"`); }
        if (a.date !== undefined) {
          if (a.date !== '' && !validDate(a.date)) { plan.problems.push(`Data inválida para "${it.title}".`); break; }
          act.date = a.date as string;
          ch.push(act.date ? `data ${shortDate(act.date)}` : 'sem data (A organizar)');
        }
        if (a.time !== undefined) {
          if (a.time !== '' && !validTime(a.time)) { plan.problems.push(`Horário inválido para "${it.title}".`); break; }
          act.time = a.time as string;
          ch.push(act.time ? `horário ${hhmm(act.time)}` : 'sem horário');
        }
        if (KINDS.includes(a.kind as Kind)) { act.kind = a.kind as Kind; ch.push(`tipo ${act.kind}`); }
        if (catOk(a.category)) { act.category = a.category; ch.push(`categoria ${state.categories.find((c) => c.id === a.category)?.name}`); }
        if (PRIOS.includes(a.priority as Prio)) { act.priority = a.priority as Prio; ch.push(`prioridade ${act.priority}`); }
        if (STATUSES.includes(a.status as Status) && !isRecurring(it)) { act.status = a.status as Status; ch.push(`situação ${act.status}`); }
        if (a.reminders_minutes !== undefined) { act.reminders_minutes = normalizeReminders(a.reminders_minutes); ch.push('lembretes'); }
        if (isStr(a.description)) { act.description = clean(a.description, 2000); ch.push('descrição'); }
        if (isStr(a.person)) { act.person = clean(a.person, 80); ch.push(`pessoa "${act.person}"`); }
        if (ch.length === 0) { plan.problems.push(`Não entendi o que mudar em "${it.title}".`); break; }
        plan.actions.push(act);
        plan.lines.push(`Alterar "${it.title}": ${ch.join(', ')}`);
        if (isRecurring(it) && act.date !== undefined) plan.warnings.push(`"${it.title}" se repete: mudar a data move o início de toda a série.`);
        break;
      }
      case 'complete_item': {
        const it = findItem();
        if (!it) break;
        const date = validDate(a.date) ? a.date : isRecurring(it) ? today : it.date;
        const wantDone = a.done !== false;
        if (isDoneOn(it, date) === wantDone) { plan.problems.push(`"${it.title}" já está ${wantDone ? 'concluído' : 'em aberto'}.`); break; }
        plan.actions.push({ type: 'complete_item', id: it.id, date, done: wantDone });
        plan.lines.push(`${wantDone ? 'Marcar como concluído' : 'Reabrir'}: "${it.title}"`);
        break;
      }
      case 'delete_item': {
        const it = findItem();
        if (!it) break;
        gone.add(it.id);
        plan.actions.push({ type: 'delete_item', id: it.id });
        plan.lines.push(`Cancelar e remover do app: "${it.title}" (${when(it.date, it.time)})`);
        plan.destructive = true;
        if (it.src === 'Google Agenda') plan.warnings.push(`"${it.title}" veio do Google Agenda: ele continua lá e ninguém é avisado do cancelamento. Faça isso por fora, se precisar.`);
        break;
      }
      case 'create_alarm': {
        if (!validTime(a.time)) { plan.problems.push('Horário inválido para o alarme.'); break; }
        const days = Array.isArray(a.days) ? [...new Set(a.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))].sort() : [];
        const name = isStr(a.name) ? clean(a.name, 80) : '';
        const repeat = a.repeat === true;
        plan.actions.push({ type: 'create_alarm', time: a.time, name, days, repeat });
        plan.lines.push(`Criar alarme: ${a.time} — ${name || 'Alarme'}${days.length ? ` (${days.map((d) => weekdayName(d).toLowerCase()).join(', ')}${repeat ? ', toda semana' : ''})` : ''}`);
        break;
      }
      case 'delete_alarm': {
        const al = isStr(a.id) ? state.alarms.find((x) => x.id === a.id) : undefined;
        if (!al) { plan.problems.push('Não encontrei esse alarme.'); break; }
        plan.actions.push({ type: 'delete_alarm', id: al.id });
        plan.lines.push(`Excluir alarme: ${al.time} — ${al.name || 'Alarme'}`);
        plan.destructive = true;
        break;
      }
      case 'add_note': {
        const text = isStr(a.text) ? a.text.trim().slice(0, 4000) : '';
        if (!text) break;
        plan.actions.push({ type: 'add_note', text });
        plan.lines.push(`Anotar: "${clean(text, 80)}${text.length > 80 ? '…' : ''}"`);
        break;
      }
      default:
        break;
    }
  }
  void longDate;
  return plan;
}

/** Aplica um plano JÁ validado. Sem efeitos fora do estado devolvido. */
export function applyPlan(state: AppState, plan: Plan, now = Date.now()): AppState {
  let s: AppState = { ...state };
  for (const a of plan.actions) {
    switch (a.type) {
      case 'create_item': {
        const item: Item = {
          id: newId('t'), title: a.title, desc: a.description ?? '', kind: a.kind ?? 'tarefa', date: a.date ?? '', time: a.time ?? '', end: '',
          cat: a.category ?? 'rs', prio: a.priority ?? 'media', status: 'pendente', rem: a.reminders_minutes ?? [],
          recur: normalizeRecur(a.recurrence) ?? { ...NO_RECUR }, doneDates: [], person: a.person ?? '', link: '', src: 'Assistente',
        };
        s = { ...s, items: [...s.items, item] };
        break;
      }
      case 'update_item':
        s = {
          ...s,
          items: s.items.map((i) => {
            if (i.id !== a.id) return i;
            const next: Item = { ...i };
            if (a.title !== undefined) next.title = a.title;
            if (a.date !== undefined) next.date = a.date;
            if (a.time !== undefined) next.time = a.time;
            if (a.kind !== undefined) next.kind = a.kind;
            if (a.category !== undefined) next.cat = a.category;
            if (a.priority !== undefined) next.prio = a.priority;
            if (a.status !== undefined) next.status = a.status;
            if (a.reminders_minutes !== undefined) next.rem = a.reminders_minutes;
            if (a.description !== undefined) next.desc = a.description;
            if (a.person !== undefined) next.person = a.person;
            if (!next.time) next.rem = []; // lembrete precisa de horário
            if (next.date === '' ) next.recur = { ...NO_RECUR };
            return next;
          }),
        };
        break;
      case 'complete_item':
        s = { ...s, items: s.items.map((i) => (i.id === a.id && isDoneOn(i, a.date ?? '') !== (a.done !== false) ? toggleDone(i, a.date ?? i.date) : i)) };
        break;
      case 'delete_item':
        s = { ...s, items: s.items.filter((i) => i.id !== a.id) };
        break;
      case 'create_alarm': {
        const alarm: Alarm = { id: newId('a'), time: a.time, name: a.name ?? '', days: a.days ?? [], repeat: a.repeat === true, enabled: true };
        s = { ...s, alarms: [...s.alarms, alarm] };
        break;
      }
      case 'delete_alarm':
        s = { ...s, alarms: s.alarms.filter((x) => x.id !== a.id), snoozes: s.snoozes.filter((x) => x.alarmId !== a.id) };
        break;
      case 'add_note':
        s = { ...s, notes: [...s.notes, { id: newId('n'), at: now, text: a.text }] };
        break;
    }
  }
  return { ...s, updatedAt: now };
}
