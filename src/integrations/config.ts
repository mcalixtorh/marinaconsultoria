/**
 * Integrações opcionais. Nada aqui "finge" funcionar: sem as variáveis de
 * ambiente o app roda 100% local e a tela de Ajustes diz exatamente isso.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const hasPush = hasSupabase && Boolean(VAPID_PUBLIC_KEY);
export const hasGoogle = Boolean(GOOGLE_CLIENT_ID);
