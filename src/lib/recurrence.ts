import type { Item, Recur } from '../types';
import { addDays, addMonths, daysInMonth, diffDays, parseISO, toISO, weekday } from './dates';

export const NO_RECUR: Recur = { type: 'none', weekdays: [], n: 1, unit: 'week' };

export function isRecurring(item: Item): boolean {
  return item.recur.type !== 'none' && item.date !== '';
}

/** O item acontece em `date`? (a data do item é o início da série) */
export function occursOn(item: Item, date: string): boolean {
  if (!item.date) return false;
  const r = item.recur;
  if (r.type === 'none') return item.date === date;
  if (date < item.date) return false;
  switch (r.type) {
    case 'daily':
      return true;
    case 'weekly': {
      const days = r.weekdays.length ? r.weekdays : [weekday(item.date)];
      return days.includes(weekday(date));
    }
    case 'monthly': {
      const startDay = parseISO(item.date).getDate();
      const d = parseISO(date);
      // dia 31 em mês de 30 dias cai no último dia do mês
      return d.getDate() === Math.min(startDay, daysInMonth(date));
    }
    case 'month_first':
      return date.endsWith('-01');
    case 'custom': {
      const n = Math.max(1, Math.floor(r.n) || 1);
      if (r.unit === 'day') return diffDays(date, item.date) % n === 0;
      if (r.unit === 'week') {
        const diff = diffDays(date, item.date);
        return diff % (7 * n) === 0;
      }
      // mês: mesmo dia do mês a cada n meses
      const a = parseISO(item.date);
      const b = parseISO(date);
      const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
      return months % n === 0 && b.getDate() === Math.min(a.getDate(), daysInMonth(date));
    }
    default:
      return false;
  }
}

/** Datas em que o item acontece dentro de [from, to] (inclusive). */
export function occurrencesBetween(item: Item, from: string, to: string): string[] {
  if (!item.date || to < from) return [];
  if (item.recur.type === 'none') return item.date >= from && item.date <= to ? [item.date] : [];
  const out: string[] = [];
  let d = from < item.date ? item.date : from;
  // teto de segurança: ~2 anos
  for (let i = 0; d <= to && i < 800; i++, d = addDays(d, 1)) {
    if (occursOn(item, d)) out.push(d);
  }
  return out;
}

export function describeRecur(r: Recur): string {
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  switch (r.type) {
    case 'none':
      return 'Não repete';
    case 'daily':
      return 'Todos os dias';
    case 'weekly':
      return r.weekdays.length ? `Toda semana (${[...r.weekdays].sort().map((d) => names[d]).join(', ')})` : 'Toda semana';
    case 'monthly':
      return 'Todo mês';
    case 'month_first':
      return 'Todo dia 1º do mês';
    case 'custom': {
      const unit = { day: 'dia', week: 'semana', month: 'mês' }[r.unit];
      const plural = { day: 'dias', week: 'semanas', month: 'meses' }[r.unit];
      return r.n === 1 ? `A cada ${unit}` : `A cada ${r.n} ${plural}`;
    }
  }
}

/** Próxima data (>= from) em que o item acontece; null se não houver em ~2 anos. */
export function nextOccurrence(item: Item, from: string): string | null {
  if (!item.date) return null;
  if (item.recur.type === 'none') return item.date >= from ? item.date : null;
  let d = from < item.date ? item.date : from;
  for (let i = 0; i < 800; i++, d = addDays(d, 1)) if (occursOn(item, d)) return d;
  return null;
}

export { addMonths, toISO };
