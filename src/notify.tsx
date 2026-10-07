import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, uid } from './store';
import { dueFires, type Fire } from './lib/reminders';
import { shortDate } from './lib/dates';
import type { MissedNotice } from './types';

/** Avisos até 2 min atrasados ainda contam como "ao vivo"; os mais antigos viram "avisos que passaram". */
const LIVE_WINDOW_MS = 2 * 60000;
const MAX_LOOKBACK_MS = 3 * 86400000;
const SNOOZE_MS = 5 * 60000;

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface NotifyInfo {
  permission: PermissionState;
  /** iPhone/iPad só recebem avisos com o app instalado na Tela de Início */
  iosNeedsInstall: boolean;
  installed: boolean;
}

export function readNotifyInfo(): NotifyInfo {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const permission: PermissionState = 'Notification' in window ? Notification.permission : 'unsupported';
  return { permission, iosNeedsInstall: ios && !installed, installed };
}

async function systemNotify(title: string, body: string, tag: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: '/' } });
      return;
    }
  } catch {
    /* cai no construtor abaixo */
  }
  try {
    new Notification(title, { body, tag, icon: '/icon-192.png' });
  } catch {
    /* o navegador não permite notificações aqui */
  }
}

// ---- som do alarme (Web Audio, sem arquivo de áudio) ----
let audio: AudioContext | null = null;
let beepTimer: number | undefined;

function startSound(): void {
  stopSound();
  try {
    audio = audio ?? new AudioContext();
    void audio.resume();
    const beep = () => {
      if (!audio) return;
      const t = audio.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t + i * 0.28);
        gain.gain.exponentialRampToValueAtTime(0.35, t + i * 0.28 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.28 + 0.2);
        osc.connect(gain).connect(audio.destination);
        osc.start(t + i * 0.28);
        osc.stop(t + i * 0.28 + 0.22);
      }
      navigator.vibrate?.([200, 100, 200]);
    };
    beep();
    beepTimer = window.setInterval(beep, 1600);
  } catch {
    /* sem áudio disponível: a tela de alarme continua aparecendo */
  }
}

function stopSound(): void {
  window.clearInterval(beepTimer);
  beepTimer = undefined;
  navigator.vibrate?.(0);
}

interface NotifyCtx {
  ringing: Fire | null;
  info: NotifyInfo;
  askPermission: () => Promise<void>;
  testAlarm: () => void;
  stop: () => void;
  snooze: () => void;
}

const Ctx = createContext<NotifyCtx | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const [ringing, setRinging] = useState<Fire | null>(null);
  const [info, setInfo] = useState<NotifyInfo>(() => readNotifyInfo());
  const stateRef = useRef(state);
  stateRef.current = state;

  const check = useCallback(() => {
    const s = stateRef.current;
    const nowMs = Date.now();
    const from = Math.max(s.lastCheck, nowMs - MAX_LOOKBACK_MS);
    if (nowMs <= from) return;
    const due = dueFires(s, from, nowMs);
    const missed: MissedNotice[] = [];
    let ring: Fire | null = null;
    for (const f of due) {
      if (nowMs - f.fireAt <= LIVE_WINDOW_MS) {
        void systemNotify(f.title, f.body, f.key);
        if (f.ring) ring = f;
      } else {
        missed.push({ key: f.key, title: f.title, body: `${f.body} · ${shortDate(new Date(f.fireAt).toISOString().slice(0, 10))}`, at: f.fireAt });
      }
    }
    dispatch({
      type: 'notify/checked',
      at: nowMs,
      missed,
      disableAlarms: due.filter((f) => f.kind === 'alarm' && s.alarms.find((a) => a.id === f.refId)?.repeat === false).map((f) => f.refId),
      usedSnoozes: due.filter((f) => f.kind === 'snooze').map((f) => f.key.slice(2)),
    });
    if (ring) {
      setRinging(ring);
      startSound();
    }
  }, [dispatch]);

  useEffect(() => {
    check();
    const t = window.setInterval(check, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setInfo(readNotifyInfo());
        check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  const value = useMemo<NotifyCtx>(
    () => ({
      ringing,
      info,
      askPermission: async () => {
        if ('Notification' in window) await Notification.requestPermission();
        setInfo(readNotifyInfo());
      },
      testAlarm: () => {
        const f: Fire = { key: `test|${Date.now()}`, kind: 'alarm', refId: '', title: 'Teste de alarme', body: 'Se você está ouvindo, o som funciona.', fireAt: Date.now(), ring: true };
        void systemNotify(f.title, f.body, f.key);
        setRinging(f);
        startSound();
      },
      stop: () => {
        stopSound();
        setRinging(null);
      },
      snooze: () => {
        if (ringing && ringing.refId) {
          dispatch({ type: 'snooze/add', snooze: { id: uid('sn'), alarmId: ringing.refId, name: ringing.title, at: Date.now() + SNOOZE_MS } });
        }
        stopSound();
        setRinging(null);
      },
    }),
    [ringing, info, dispatch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotify(): NotifyCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useNotify fora do NotifyProvider');
  return c;
}

/** Texto honesto sobre o que funciona hoje neste aparelho. */
export function describeNotifyStatus(info: NotifyInfo): { label: string; ok: boolean; hint: string } {
  if (info.permission === 'unsupported') {
    return { label: 'Notificações: indisponíveis neste navegador', ok: false, hint: 'Os avisos aparecem só dentro do app, enquanto ele está aberto.' };
  }
  if (info.iosNeedsInstall) {
    return { label: 'Notificações: instale o app primeiro', ok: false, hint: 'No iPhone, toque em Compartilhar › Adicionar à Tela de Início e abra o app por lá.' };
  }
  if (info.permission === 'denied') {
    return { label: 'Notificações: bloqueadas neste navegador', ok: false, hint: 'Libere nas configurações do navegador/aparelho para este site.' };
  }
  if (info.permission === 'default') {
    return { label: 'Notificações: ainda não permitidas', ok: false, hint: 'Toque em "Permitir notificações".' };
  }
  return {
    label: 'Notificações: permitidas',
    ok: true,
    hint: 'Avisam com o app aberto ou em segundo plano. Com o app fechado, só com o servidor de push configurado (veja o README).',
  };
}
