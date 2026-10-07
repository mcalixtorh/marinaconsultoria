import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppState } from '../types';
import { scheduleForServer } from '../lib/reminders';
import { SUPABASE_ANON_KEY, SUPABASE_URL, VAPID_PUBLIC_KEY, hasSupabase } from './config';

/**
 * Sincronização e push (OPCIONAL). Requer o projeto Supabase descrito no README
 * e o arquivo supabase/schema.sql aplicado. Sem configuração, nada disto é usado.
 *
 * Modelo: um documento por usuária (tabela app_state) com o estado completo,
 * "última alteração vence". A lista de avisos futuros vai para scheduled_notifications,
 * e a Edge Function send-reminders envia o push na hora certa.
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!hasSupabase) return null;
  client = client ?? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  return client;
}

export async function currentUserEmail(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function signInWithEmail(email: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'Sincronização não configurada.';
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut();
}

/** Estado do servidor, ou null se ainda não houver cópia. */
export async function pullState(): Promise<{ state: AppState; updatedAt: number } | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.from('app_state').select('data, updated_at_ms').maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { state: data.data as AppState, updatedAt: Number(data.updated_at_ms) } : null;
}

export async function pushState(state: AppState): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error('Entre com seu e-mail primeiro.');
  const { error } = await sb.from('app_state').upsert({ user_id: auth.user.id, data: state, updated_at_ms: state.updatedAt });
  if (error) throw new Error(error.message);
  await pushSchedule(state, auth.user.id);
}

/** Substitui os avisos futuros (14 dias) que o servidor deve enviar. */
async function pushSchedule(state: AppState, userId: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const fires = scheduleForServer(state, Date.now(), 14);
  await sb.from('scheduled_notifications').delete().eq('user_id', userId).eq('sent', false);
  if (fires.length === 0) return;
  const rows = fires.map((f) => ({ user_id: userId, key: f.key, fire_at: new Date(f.fireAt).toISOString(), title: f.title, body: f.body, ring: f.ring, sent: false }));
  const { error } = await sb.from('scheduled_notifications').upsert(rows, { onConflict: 'user_id,key' });
  if (error) throw new Error(error.message);
}

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Registra este aparelho para receber push com o app fechado. */
export async function subscribePush(): Promise<string | null> {
  const sb = supabase();
  if (!sb || !VAPID_PUBLIC_KEY) return 'Push não configurado (faltam as chaves VAPID).';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'Este navegador não suporta push.';
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return 'Entre com seu e-mail primeiro.';
  if ((await Notification.requestPermission()) !== 'granted') return 'Permissão de notificações negada.';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({ user_id: auth.user.id, endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }, { onConflict: 'endpoint' });
  return error ? error.message : null;
}
