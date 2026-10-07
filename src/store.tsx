import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { Alarm, AppState, Category, DayPriority, Item, MissedNotice, Note, Routine, Snooze, Status } from './types';
import { toISO, nowMinutes } from './lib/dates';
import { loadState, saveState } from './lib/storage';
import { reschedule, toggleDone } from './lib/tasks';
import { addIgnored } from './lib/gcal';

export type Action =
  | { type: 'item/save'; item: Item }
  | { type: 'item/delete'; id: string }
  | { type: 'item/toggle'; id: string; date: string }
  | { type: 'item/status'; id: string; status: Status }
  | { type: 'item/reschedule'; id: string; date: string }
  | { type: 'priority/set'; date: string; index: number; patch: Partial<DayPriority> }
  | { type: 'routine/step'; routineId: string; date: string; stepId: string }
  | { type: 'routine/clear'; routineId: string; date: string }
  | { type: 'routine/save'; routine: Routine }
  | { type: 'routine/delete'; id: string }
  | { type: 'alarm/save'; alarm: Alarm }
  | { type: 'alarm/delete'; id: string }
  | { type: 'alarm/toggle'; id: string }
  | { type: 'note/save'; note: Note }
  | { type: 'note/delete'; id: string }
  | { type: 'category/add'; category: Category }
  | { type: 'category/delete'; id: string }
  | { type: 'notify/checked'; at: number; missed: MissedNotice[]; disableAlarms: string[]; usedSnoozes: string[] }
  | { type: 'notify/dismiss'; key?: string }
  | { type: 'snooze/add'; snooze: Snooze }
  | { type: 'gcal/meta'; gcal: AppState['gcal'] }
  | { type: 'state/replace'; state: AppState };

const upsert = <T extends { id: string }>(list: T[], v: T): T[] =>
  list.some((x) => x.id === v.id) ? list.map((x) => (x.id === v.id ? v : x)) : [...list, v];

function reduce(s: AppState, a: Action): AppState {
  const touch = (p: Partial<AppState>): AppState => ({ ...s, ...p, updatedAt: Date.now() });
  switch (a.type) {
    case 'item/save':
      return touch({ items: upsert(s.items, a.item) });
    case 'item/delete': {
      const gone = s.items.find((i) => i.id === a.id);
      return touch({ items: s.items.filter((i) => i.id !== a.id), ...(gone?.ext ? { gcal: addIgnored(s.gcal, gone.ext) } : {}) });
    }
    case 'item/toggle':
      return touch({ items: s.items.map((i) => (i.id === a.id ? toggleDone(i, a.date) : i)) });
    case 'item/status':
      return touch({ items: s.items.map((i) => (i.id === a.id ? { ...i, status: a.status } : i)) });
    case 'item/reschedule':
      return touch({ items: s.items.map((i) => (i.id === a.id ? reschedule(i, a.date) : i)) });
    case 'priority/set': {
      const cur = s.priorities[a.date] ?? [0, 1, 2].map(() => ({ text: '', done: false }));
      const next = cur.map((p, idx) => (idx === a.index ? { ...p, ...a.patch } : p));
      return touch({ priorities: { ...s.priorities, [a.date]: next } });
    }
    case 'routine/step':
      return touch({
        routines: s.routines.map((r) => {
          if (r.id !== a.routineId) return r;
          const day = new Set(r.done[a.date] ?? []);
          if (day.has(a.stepId)) day.delete(a.stepId);
          else day.add(a.stepId);
          return { ...r, done: { ...r.done, [a.date]: [...day] } };
        }),
      });
    case 'routine/clear':
      return touch({
        routines: s.routines.map((r) => (r.id === a.routineId ? { ...r, done: { ...r.done, [a.date]: [] } } : r)),
      });
    case 'routine/save':
      return touch({ routines: upsert(s.routines, a.routine) });
    case 'routine/delete':
      return touch({ routines: s.routines.filter((r) => r.id !== a.id) });
    case 'alarm/save':
      return touch({ alarms: upsert(s.alarms, a.alarm) });
    case 'alarm/delete':
      return touch({ alarms: s.alarms.filter((x) => x.id !== a.id), snoozes: s.snoozes.filter((x) => x.alarmId !== a.id) });
    case 'alarm/toggle':
      return touch({ alarms: s.alarms.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)) });
    case 'note/save':
      return touch({ notes: upsert(s.notes, a.note) });
    case 'note/delete':
      return touch({ notes: s.notes.filter((n) => n.id !== a.id) });
    case 'category/add':
      return touch({ categories: [...s.categories, a.category] });
    case 'category/delete':
      return s.items.some((i) => i.cat === a.id) ? s : touch({ categories: s.categories.filter((c) => c.id !== a.id) });
    case 'notify/checked':
      return {
        ...s,
        lastCheck: a.at,
        missed: [...s.missed, ...a.missed.filter((m) => !s.missed.some((x) => x.key === m.key))].slice(-50),
        alarms: s.alarms.map((x) => (a.disableAlarms.includes(x.id) ? { ...x, enabled: false } : x)),
        snoozes: s.snoozes.filter((x) => !a.usedSnoozes.includes(x.id)),
      };
    case 'notify/dismiss':
      return { ...s, missed: a.key ? s.missed.filter((m) => m.key !== a.key) : [] };
    case 'snooze/add':
      return { ...s, snoozes: [...s.snoozes, a.snooze] };
    case 'gcal/meta':
      return { ...s, gcal: a.gcal };
    case 'state/replace':
      return a.state;
  }
}

export type SaveStatus = 'salvo' | 'salvando' | 'erro';

interface Ctx {
  state: AppState;
  dispatch: Dispatch<Action>;
  /** momento atual, atualizado a cada 30 s */
  now: Date;
  today: string;
  nowMin: number;
  saveStatus: SaveStatus;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, loadState);
  const [now, setNow] = useState(() => new Date());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('salvo');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // grava no aparelho 300 ms depois da última alteração
  useEffect(() => {
    setSaveStatus('salvando');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaveStatus(saveState(state) ? 'salvo' : 'erro'), 300);
    return () => window.clearTimeout(timer.current);
  }, [state]);

  // não perde a última alteração se a aba for fechada de repente
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const flush = () => saveState(latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ state, dispatch, now, today: toISO(now), nowMin: nowMinutes(now), saveStatus }),
    [state, now, saveStatus],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore fora do StoreProvider');
  return c;
}

export function useCategoryName(): (id: string) => string {
  const { state } = useStore();
  return useCallback((id: string) => state.categories.find((c) => c.id === id)?.name ?? 'Sem categoria', [state.categories]);
}

export const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
