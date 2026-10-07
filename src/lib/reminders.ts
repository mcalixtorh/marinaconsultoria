import type { Alarm, AppState, Item } from '../types';
import { addDays, toISO, toTimestamp, weekday } from './dates';
import { occurrencesBetween } from './recurrence';
import { isDoneOn } from './tasks';

export const REMINDER_OPTIONS: { min: number; label: string }[] = [
  { min: 1440, label: '1 dia antes' },
  { min: 180, label: '3 horas antes' },
  { min: 60, label: '1 hora antes' },
  { min: 30, label: '30 minutos antes' },
  { min: 10, label: '10 minutos antes' },
  { min: 0, label: 'No horário' },
];

export function reminderLabel(min: number): string {
  return REMINDER_OPTIONS.find((o) => o.min === min)?.label ?? `${min} min antes`;
}

export interface Fire {
  /** chave única do aviso (evita disparar duas vezes) */
  key: string;
  kind: 'item' | 'alarm' | 'snooze';
  refId: string;
  title: string;
  body: string;
  fireAt: number;
  /** alarmes tocam com som e tela própria */
  ring: boolean;
}

function hhmm(time: string): string {
  return time.replace(':', 'h').replace(/h00$/, 'h');
}

/** Lembretes de compromissos/tarefas que disparam em (fromMs, toMs]. */
export function itemFires(items: Item[], fromMs: number, toMs: number): Fire[] {
  const out: Fire[] = [];
  const startDay = toISO(new Date(fromMs));
  // um aviso "1 dia antes" pode ser de um item de até 2 dias à frente
  const endDay = addDays(toISO(new Date(toMs)), 2);
  for (const item of items) {
    if (!item.date || !item.time || item.rem.length === 0) continue;
    for (const date of occurrencesBetween(item, addDays(startDay, -1), endDay)) {
      if (isDoneOn(item, date)) continue;
      const startMs = toTimestamp(date, item.time);
      for (const min of item.rem) {
        const fireAt = startMs - min * 60000;
        if (fireAt <= fromMs || fireAt > toMs) continue;
        out.push({
          key: `i|${item.id}|${date}|${min}`,
          kind: 'item',
          refId: item.id,
          title: item.title,
          body: min === 0 ? `Agora, às ${hhmm(item.time)}` : `${reminderLabel(min)} — às ${hhmm(item.time)}`,
          fireAt,
          ring: false,
        });
      }
    }
  }
  return out;
}

/** Quando o alarme toca em (fromMs, toMs]. Alarme "uma vez" sem dias toca no próximo horário. */
export function alarmFires(alarms: Alarm[], fromMs: number, toMs: number): Fire[] {
  const out: Fire[] = [];
  const first = toISO(new Date(fromMs));
  const last = toISO(new Date(toMs));
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    for (let d = first; d <= last; d = addDays(d, 1)) {
      if (alarm.days.length > 0 && !alarm.days.includes(weekday(d))) continue;
      const fireAt = toTimestamp(d, alarm.time);
      if (fireAt <= fromMs || fireAt > toMs) continue;
      out.push({
        key: `a|${alarm.id}|${d}`,
        kind: 'alarm',
        refId: alarm.id,
        title: alarm.name || 'Alarme',
        body: `Alarme das ${hhmm(alarm.time)}`,
        fireAt,
        ring: true,
      });
    }
  }
  return out;
}

export function snoozeFires(state: AppState, fromMs: number, toMs: number): Fire[] {
  return state.snoozes
    .filter((s) => s.at > fromMs && s.at <= toMs)
    .map((s) => ({
      key: `s|${s.id}`,
      kind: 'snooze' as const,
      refId: s.alarmId,
      title: s.name || 'Alarme',
      body: 'Soneca terminou',
      fireAt: s.at,
      ring: true,
    }));
}

/** Tudo que deveria ter disparado em (fromMs, toMs], em ordem cronológica. */
export function dueFires(state: AppState, fromMs: number, toMs: number): Fire[] {
  return [
    ...itemFires(state.items, fromMs, toMs),
    ...alarmFires(state.alarms, fromMs, toMs),
    ...snoozeFires(state, fromMs, toMs),
  ].sort((a, b) => a.fireAt - b.fireAt);
}

/** Avisos futuros (para o servidor de push), na janela [fromMs, fromMs + days]. */
export function scheduleForServer(state: AppState, fromMs: number, days = 14): Fire[] {
  const toMs = fromMs + days * 86400000;
  return [...itemFires(state.items, fromMs, toMs), ...alarmFires(state.alarms, fromMs, toMs)].sort(
    (a, b) => a.fireAt - b.fireAt,
  );
}
