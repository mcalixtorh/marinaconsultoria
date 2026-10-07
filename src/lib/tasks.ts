import type { Item, Occurrence, Status } from '../types';
import { addDays, startOfWeek, toMinutes } from './dates';
import { isRecurring, occursOn, occurrencesBetween } from './recurrence';

/** Quantos dias para trás procuramos uma ocorrência recorrente atrasada. */
const OVERDUE_LOOKBACK_DAYS = 60;

export function isDoneOn(item: Item, date: string): boolean {
  if (isRecurring(item)) return (item.doneDates ?? []).includes(date);
  return item.status === 'concluido';
}

function sortByTime(a: Occurrence, b: Occurrence): number {
  const ta = a.item.time || '99:99';
  const tb = b.item.time || '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.item.title.localeCompare(b.item.title, 'pt-BR');
}

/** Tudo que acontece em `date`, com horário primeiro e sem horário depois. */
export function occurrencesOn(items: Item[], date: string): Occurrence[] {
  return items
    .filter((i) => occursOn(i, date))
    .map((item) => ({ item, date, done: isDoneOn(item, date) }))
    .sort(sortByTime);
}

/**
 * Atrasado = não concluído e (data anterior a hoje, ou hoje com horário já
 * passado e tipo "tarefa"). Lembretes nunca ficam atrasados.
 */
export function isOverdue(item: Item, date: string, today: string, nowMin: number): boolean {
  if (!date) return false; // sem data = "A organizar", nunca atrasado
  if (item.kind === 'lembrete') return false;
  if (isDoneOn(item, date)) return false;
  if (date < today) return true;
  if (date === today && item.kind === 'tarefa' && item.time) return toMinutes(item.time) < nowMin;
  return false;
}

/** Itens atrasados. Recorrentes aparecem só pela ocorrência atrasada mais recente. */
export function overdueOccurrences(items: Item[], today: string, nowMin: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const item of items) {
    if (!item.date) continue;
    if (!isRecurring(item)) {
      if (isOverdue(item, item.date, today, nowMin)) out.push({ item, date: item.date, done: false });
      continue;
    }
    const from = addDays(today, -OVERDUE_LOOKBACK_DAYS);
    const dates = occurrencesBetween(item, from, today).reverse(); // mais recente primeiro
    const hit = dates.find((d) => isOverdue(item, d, today, nowMin));
    if (hit) out.push({ item, date: hit, done: false });
  }
  return out.sort((a, b) => (a.date === b.date ? sortByTime(a, b) : a.date < b.date ? -1 : 1));
}

/** Situação para exibição: "atrasado" é calculado, nunca gravado. */
export function displayStatus(item: Item, date: string, today: string, nowMin: number): Status | 'atrasado' {
  if (isDoneOn(item, date)) return 'concluido';
  if (isOverdue(item, date, today, nowMin)) return 'atrasado';
  return isRecurring(item) ? 'pendente' : item.status;
}

/** Marca/desmarca como concluído (para recorrentes, só a ocorrência de `date`). */
export function toggleDone(item: Item, date: string): Item {
  if (isRecurring(item)) {
    const done = new Set(item.doneDates ?? []);
    if (done.has(date)) done.delete(date);
    else done.add(date);
    return { ...item, doneDates: [...done].sort() };
  }
  return { ...item, status: item.status === 'concluido' ? 'pendente' : 'concluido' };
}

/** Itens sem data (e ainda não concluídos). */
export function toOrganize(items: Item[]): Item[] {
  return items.filter((i) => !i.date && i.status !== 'concluido');
}

export interface Stats {
  total: number;
  done: number;
  pending: number;
  overdue: number;
}

/** Contagem de ocorrências entre `from` e `to`. Lembretes não entram na conta. */
export function statsBetween(items: Item[], from: string, to: string, today: string, nowMin: number): Stats {
  const s: Stats = { total: 0, done: 0, pending: 0, overdue: 0 };
  for (const item of items) {
    if (item.kind === 'lembrete') continue;
    for (const date of occurrencesBetween(item, from, to)) {
      s.total++;
      if (isDoneOn(item, date)) s.done++;
      else if (isOverdue(item, date, today, nowMin)) s.overdue++;
      else s.pending++;
    }
  }
  return s;
}

export function weekRange(today: string): [string, string] {
  const start = startOfWeek(today);
  return [start, addDays(start, 6)];
}

/** Próximos itens com horário (inclui hoje, depois de agora) nos próximos `days` dias. */
export function upcoming(items: Item[], today: string, nowMin: number, limit = 6, days = 14): Occurrence[] {
  const list: Occurrence[] = [];
  for (const item of items) {
    if (!item.date || !item.time) continue;
    for (const date of occurrencesBetween(item, today, addDays(today, days))) {
      if (date === today && toMinutes(item.time) < nowMin) continue;
      const done = isDoneOn(item, date);
      if (!done) list.push({ item, date, done });
    }
  }
  list.sort((a, b) => (a.date === b.date ? sortByTime(a, b) : a.date < b.date ? -1 : 1));
  return list.slice(0, limit);
}

/** Reagenda um item único para uma nova data (itens recorrentes não são reagendados). */
export function reschedule(item: Item, date: string): Item {
  if (isRecurring(item)) return item;
  return { ...item, date, status: item.status === 'concluido' ? 'pendente' : item.status };
}
