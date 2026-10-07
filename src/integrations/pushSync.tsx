import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { scheduleForServer } from '../lib/reminders';
import { PASS_EVENT, readPass } from './passcode';
import { currentSubscription, syncSchedule } from './push';

interface Ctx {
  /** este aparelho está cadastrado para receber avisos com o app fechado */
  subscribed: boolean;
  /** relê se há inscrição (depois de ativar/desativar) e reenvia a agenda de avisos */
  refresh: () => Promise<void>;
  lastError: string;
}

const PushCtx = createContext<Ctx | null>(null);
const EVERY_MS = 30 * 60_000;
const DEBOUNCE_MS = 4000;

/** Mantém o servidor com a agenda de avisos em dia sempre que o app muda. */
export function PushSyncProvider({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const latest = useRef(state);
  latest.current = state;
  const [subscribed, setSubscribed] = useState(false);
  const [lastError, setLastError] = useState('');
  const lastSig = useRef('');
  const busy = useRef(false);

  const push = useCallback(async (force: boolean) => {
    if (busy.current || !readPass() || !(await currentSubscription())) return;
    const fires = scheduleForServer(latest.current, Date.now(), 14);
    const sig = fires.map((f) => `${f.key}@${f.fireAt}@${f.title}`).join('|');
    if (!force && sig === lastSig.current) return; // nada mudou desde o último envio
    busy.current = true;
    try {
      const err = await syncSchedule(latest.current);
      if (err) setLastError(err);
      else {
        lastSig.current = sig;
        setLastError('');
      }
    } catch {
      setLastError('Sem conexão para atualizar os avisos.');
    } finally {
      busy.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    setSubscribed(Boolean(await currentSubscription()));
    lastSig.current = '';
    await push(true);
  }, [push]);

  useEffect(() => {
    void currentSubscription().then((s) => setSubscribed(Boolean(s)));
  }, []);

  // reenvia pouco depois de qualquer mudança em itens ou alarmes
  useEffect(() => {
    const t = window.setTimeout(() => void push(false), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.items, state.alarms, push]);

  useEffect(() => {
    const timer = window.setInterval(() => void push(true), EVERY_MS); // renova a janela de 14 dias
    const onVisible = () => document.visibilityState === 'visible' && void push(false);
    const onPass = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(PASS_EVENT, onPass);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PASS_EVENT, onPass);
    };
  }, [push, refresh]);

  const value = useMemo(() => ({ subscribed, refresh, lastError }), [subscribed, refresh, lastError]);
  return <PushCtx.Provider value={value}>{children}</PushCtx.Provider>;
}

export function usePushSync(): Ctx {
  const c = useContext(PushCtx);
  if (!c) throw new Error('usePushSync fora do PushSyncProvider');
  return c;
}
