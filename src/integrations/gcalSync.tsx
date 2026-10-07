import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { mergeCalendar, type GcalEvent } from '../lib/gcal';
import { PASS_EVENT, readPass } from './passcode';

export type GcalPhase = 'idle' | 'syncing' | 'ok' | 'error' | 'off' | 'needpass' | 'dev';

export interface GcalStatus {
  phase: GcalPhase;
  message: string;
  /** o que mudou na última leitura */
  last?: { added: number; updated: number; removed: number; read: number };
}

interface Ctx {
  status: GcalStatus;
  syncNow: () => Promise<void>;
}

const SyncCtx = createContext<Ctx | null>(null);
const EVERY_MS = 10 * 60_000;
const MIN_GAP_MS = 2 * 60_000;

export function GcalSyncProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, today } = useStore();
  const latest = useRef(state);
  latest.current = state;
  const todayRef = useRef(today);
  todayRef.current = today;
  const busy = useRef(false);
  const lastTry = useRef(0);
  const [status, setStatus] = useState<GcalStatus>({ phase: 'idle', message: '' });

  const syncNow = useCallback(async () => {
    if (busy.current) return;
    const pass = readPass();
    if (!pass) return setStatus({ phase: 'needpass', message: 'Digite a senha do assistente para ler o Google Agenda.' });
    busy.current = true;
    lastTry.current = Date.now();
    setStatus((s) => ({ ...s, phase: 'syncing', message: 'Lendo o Google Agenda…' }));
    try {
      const res = await fetch('/api/calendar', { headers: { 'x-passcode': pass } });
      const data = (await res.json().catch(() => ({}))) as { events?: GcalEvent[]; window?: { from: string; to: string }; error?: string; code?: string };
      if (res.status === 404) return setStatus({ phase: 'dev', message: 'A leitura do Google Agenda só funciona no app publicado (Vercel).' });
      if (res.status === 503) return setStatus({ phase: 'off', message: data.error ?? 'Ainda não ativado.' });
      if (res.status === 401) return setStatus({ phase: 'needpass', message: 'Senha incorreta. Digite de novo.' });
      if (!res.ok || !data.events || !data.window) return setStatus({ phase: 'error', message: data.error ?? 'Não consegui ler o Google Agenda agora.' });

      const r = mergeCalendar(latest.current, data.events, data.window, todayRef.current);
      if (r.added + r.updated + r.removed > 0) dispatch({ type: 'state/replace', state: r.state });
      else dispatch({ type: 'gcal/meta', gcal: r.state.gcal });
      setStatus({ phase: 'ok', message: '', last: { added: r.added, updated: r.updated, removed: r.removed, read: data.events.length } });
    } catch {
      setStatus({ phase: 'error', message: 'Sem conexão para ler o Google Agenda.' });
    } finally {
      busy.current = false;
    }
  }, [dispatch]);

  useEffect(() => {
    const first = window.setTimeout(() => void syncNow(), 2500);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void syncNow(), EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && Date.now() - lastTry.current > MIN_GAP_MS && void syncNow();
    const onPass = () => void syncNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(PASS_EVENT, onPass);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PASS_EVENT, onPass);
    };
  }, [syncNow]);

  const value = useMemo(() => ({ status, syncNow }), [status, syncNow]);
  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

export function useGcal(): Ctx {
  const c = useContext(SyncCtx);
  if (!c) throw new Error('useGcal fora do GcalSyncProvider');
  return c;
}
