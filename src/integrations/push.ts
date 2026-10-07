import type { AppState } from '../types';
import { scheduleForServer } from '../lib/reminders';
import { readPass } from './passcode';

/** Cliente da função /api/push: avisos com o app fechado e cópia dos dados na nuvem. */

export interface ApiResult<T = any> { ok: boolean; status: number; json: T }

async function api<T = any>(action: string, body?: unknown, method: 'GET' | 'POST' = 'POST'): Promise<ApiResult<T>> {
  const payload = method === 'POST' ? JSON.stringify(body ?? {}) : undefined;
  const res = await fetch(`/api/push?action=${action}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-passcode': readPass() },
    body: payload,
    // termina o envio mesmo se o iPhone "dormir" o app logo depois (limite do navegador: 64 KB)
    keepalive: payload !== undefined && payload.length < 60_000,
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, json };
}

/** Mensagem em português para um erro da função, ou null se deu certo. */
export function explain(r: ApiResult<any>): string | null {
  if (r.ok) return null;
  if (r.status === 404) return 'Isto só funciona no app publicado (Vercel), não no modo de desenvolvimento.';
  if (r.status === 401) return 'Senha incorreta. Digite de novo em Ajustes › Google Agenda.';
  if (r.status === 503) return r.json.error ?? 'Ainda não ativado no servidor.';
  return r.json.error ?? 'Algo deu errado. Tente de novo.';
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

function keyToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Pede permissão, cadastra este aparelho no servidor e devolve uma mensagem de erro (ou null). */
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return 'Este navegador não suporta avisos com o app fechado. No iPhone, instale o app na Tela de Início primeiro.';
  if (!readPass()) return 'Digite a senha do app primeiro (Ajustes › Google Agenda).';
  const k = await api<{ publicKey?: string; error?: string }>('key');
  const err = explain(k);
  if (err || !k.json.publicKey) return err ?? 'O servidor não devolveu a chave.';
  if ((await Notification.requestPermission()) !== 'granted') return 'Você não permitiu as notificações. Libere nas configurações do aparelho para este app.';
  const reg = await navigator.serviceWorker.ready;
  // se já existe uma inscrição de outra chave, troca
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(k.json.publicKey) });
  return explain(await api('subscribe', { subscription: sub.toJSON() }));
}

export async function disablePush(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return explain(await api('unsubscribe', { endpoint }));
}

export async function sendTest(): Promise<string> {
  const r = await api<{ ok?: boolean; message?: string }>('test');
  return explain(r) ?? (r.json.ok ? 'Enviei. Bloqueie o celular e espere alguns segundos.' : r.json.message ?? 'Não consegui enviar.');
}

export interface PushStatus {
  devices: number;
  pending: number;
  next: { at: string; title: string } | null;
  lastCron: { at: number; due: number; sent: number; skipped: number } | null;
  deniedAt: number | null;
}

export async function pushStatus(): Promise<PushStatus | null> {
  if (!readPass()) return null;
  const r = await api<PushStatus>('status', undefined, 'GET');
  return r.ok ? r.json : null;
}

/** Manda ao servidor a agenda de avisos dos próximos 14 dias (troca a anterior). */
export async function syncSchedule(state: AppState, now = Date.now()): Promise<string | null> {
  const fires = scheduleForServer(state, now, 14).map((f) => ({ key: f.key, fireAt: f.fireAt, title: f.title, body: f.body }));
  return explain(await api('schedule', { fires }));
}

export async function cloudPut(state: AppState): Promise<string | null> {
  return explain(await api('state-put', { state }));
}

export async function cloudGet(): Promise<{ state: AppState | null; error: string | null }> {
  const r = await api<{ state: AppState | null }>('state-get', undefined, 'GET');
  const error = explain(r);
  return { state: r.ok ? r.json.state : null, error };
}
