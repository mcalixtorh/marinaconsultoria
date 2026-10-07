// Edge Function (Deno): envia por Web Push os avisos que já chegaram na hora.
// Chamada a cada minuto pelo pg_cron (veja supabase/schema.sql).
//
// Segredos necessários (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@email.com)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem dentro das Edge Functions.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

// Avisos com mais de 10 minutos de atraso não são enviados (o app mostra em "Avisos que passaram").
const MAX_LATE_MS = 10 * 60 * 1000;

Deno.serve(async () => {
  const now = Date.now();
  const { data: due, error } = await sb
    .from('scheduled_notifications')
    .select('user_id, key, fire_at, title, body')
    .eq('sent', false)
    .lte('fire_at', new Date(now).toISOString())
    .limit(200);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const n of due ?? []) {
    const late = now - new Date(n.fire_at).getTime();
    if (late <= MAX_LATE_MS) {
      const { data: subs } = await sb.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id);
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.body, tag: n.key }));
          sent++;
        } catch (e) {
          // 404/410: o aparelho cancelou a inscrição
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }
    await sb.from('scheduled_notifications').update({ sent: true }).eq('user_id', n.user_id).eq('key', n.key);
  }
  return new Response(JSON.stringify({ due: due?.length ?? 0, sent }), { headers: { 'Content-Type': 'application/json' } });
});
