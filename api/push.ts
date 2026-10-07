/**
 * Avisos com o app fechado (Web Push) + cópia dos dados na nuvem.
 *
 * Fluxo: o app manda para cá a agenda de avisos dos próximos dias; um agendador
 * do Supabase (pg_cron) chama esta função a cada minuto (?action=send) e ela dispara
 * a notificação para os aparelhos cadastrados. O banco é o Supabase (só um "caderno":
 * nenhum login, só a senha do app).
 *
 * Variáveis (Vercel): ASSISTANT_PASSCODE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_SUBJECT.
 * As chaves VAPID são geradas aqui na primeira vez e ficam no banco: ninguém copia chave nenhuma.
 */
import { timingSafeEqual } from 'node:crypto';
import * as webpushNs from 'web-push';

type WebPush = typeof import('web-push');
// web-push é CommonJS: no Node ESM só o default é confiável
const wp: WebPush = ((webpushNs as unknown as { default?: WebPush }).default ?? webpushNs) as WebPush;

interface Req { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface Res { status(code: number): Res; setHeader(name: string, value: string): void; json(body: unknown): void }

/** Avisos com mais de 10 min de atraso não são enviados (o app mostra em "Avisos que passaram"). */
const MAX_LATE_MS = 10 * 60_000;
const MAX_FIRES = 2000;

const header = (req: Req, n: string) => { const v = req.headers[n]; return (Array.isArray(v) ? v[0] : v) ?? ''; };
function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

// trava contra tentativa de adivinhar a senha (por instância; é só uma proteção extra)
const fails = new Map<string, number[]>();
function tooManyFails(ip: string): boolean {
  const recent = (fails.get(ip) ?? []).filter((t) => Date.now() - t < 10 * 60_000);
  fails.set(ip, recent);
  return recent.length >= 10;
}

// ---------------------------------------------------------------- Supabase (REST, chave de serviço)
function db() {
  const base = `${process.env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  // chave antiga (service_role) é um JWT (eyJ…) e vai também em Authorization; a nova (sb_secret_…) vai só em apikey
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  const call = async (path: string, init: RequestInit & { prefer?: string } = {}) => {
    const { prefer, ...rest } = init;
    const r = await fetch(`${base}/${path}`, { ...rest, headers: { ...h, ...(prefer ? { Prefer: prefer } : {}) } });
    if (!r.ok) throw new Error(`banco ${r.status}`);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  const q = encodeURIComponent;
  return {
    get: (table: string, query = '') => call(`${table}${query ? `?${query}` : ''}`) as Promise<any[]>,
    upsert: (table: string, rows: unknown, onConflict: string, ignore = false) =>
      call(`${table}?on_conflict=${onConflict}`, { method: 'POST', body: JSON.stringify(rows), prefer: `resolution=${ignore ? 'ignore' : 'merge'}-duplicates,return=minimal` }),
    del: (table: string, filter: string) => call(`${table}?${filter}`, { method: 'DELETE', prefer: 'return=minimal' }),
    /** marca como enviado só se ainda não estava: devolve as linhas que ESTA chamada conseguiu "pegar" */
    claim: (key: string) => call(`scheduled?key=eq.${q(key)}&sent=eq.false`, { method: 'PATCH', body: JSON.stringify({ sent: true }), prefer: 'return=representation' }) as Promise<any[]>,
    q,
  };
}
type Db = ReturnType<typeof db>;

async function vapid(d: Db): Promise<{ publicKey: string; privateKey: string }> {
  const read = async () => {
    const rows = await d.get('kv', 'name=eq.vapid&select=value');
    return rows[0] ? (JSON.parse(rows[0].value) as { publicKey: string; privateKey: string }) : null;
  };
  const have = await read();
  if (have) return have;
  const fresh = wp.generateVAPIDKeys();
  await d.upsert('kv', { name: 'vapid', value: JSON.stringify(fresh) }, 'name', true); // se duas chamadas correrem juntas, vale a primeira
  return (await read()) ?? fresh;
}

async function pushAll(d: Db, payload: { title: string; body: string; tag: string }): Promise<number> {
  const keys = await vapid(d);
  wp.setVapidDetails(process.env.VAPID_SUBJECT!, keys.publicKey, keys.privateKey);
  const subs = await d.get('push_subscriptions', 'select=endpoint,p256dh,auth');
  let ok = 0;
  for (const s of subs) {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 600, urgency: 'high' });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await d.del('push_subscriptions', `endpoint=eq.${d.q(s.endpoint)}`); // aparelho cancelou
    }
  }
  return ok;
}

async function sendDue(d: Db): Promise<{ due: number; sent: number; skipped: number }> {
  const rows = await d.get('scheduled', `sent=eq.false&fire_at=lte.${d.q(new Date().toISOString())}&order=fire_at.asc&limit=200&select=key,fire_at,title,body`);
  let sent = 0, skipped = 0;
  for (const r of rows) {
    const mine = await d.claim(r.key);
    if (mine.length === 0) continue; // outra chamada já pegou
    if (Date.now() - new Date(r.fire_at).getTime() > MAX_LATE_MS) { skipped++; continue; }
    sent += await pushAll(d, { title: r.title, body: r.body, tag: r.key });
  }
  return { due: rows.length, sent, skipped };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const action = new URL(req.url ?? '/', 'http://x').searchParams.get('action') ?? '';
  if (req.method !== 'GET' && req.method !== 'POST') return void res.status(405).json({ error: 'Método não permitido.' });

  const missing = ['ASSISTANT_PASSCODE', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_SUBJECT'].filter((n) => !process.env[n]);
  if (missing.length) return void res.status(503).json({ code: 'not_configured', error: `Avisos ainda não ativados no servidor. Faltam: ${missing.join(', ')}.`, missing });

  const ip = header(req, 'x-forwarded-for').split(',')[0].trim() || 'sem-ip';
  const d = db();
  try {
    // o agendador do banco chama "send" com um segredo que só ele e esta função conhecem
    if (action === 'send') {
      const rows = await d.get('kv', 'name=eq.cron_secret&select=value');
      if (!rows[0] || !same(header(req, 'x-cron-secret'), rows[0].value)) {
        await d.upsert('kv', { name: 'cron_denied', value: String(Date.now()) }, 'name').catch(() => {});
        return void res.status(401).json({ error: 'Não autorizado.' });
      }
      const result = await sendDue(d);
      // deixa um rastro de que o agendador chegou até aqui (aparece em Ajustes)
      await d.upsert('kv', { name: 'last_send', value: JSON.stringify({ at: Date.now(), ...result }) }, 'name').catch(() => {});
      return void res.status(200).json(result);
    }

    if (tooManyFails(ip)) return void res.status(429).json({ error: 'Muitas tentativas. Espere alguns minutos.' });
    if (!same(header(req, 'x-passcode'), process.env.ASSISTANT_PASSCODE!)) {
      fails.set(ip, [...(fails.get(ip) ?? []), Date.now()]);
      return void res.status(401).json({ code: 'bad_passcode', error: 'Senha incorreta.' });
    }
    const body = (req.body && typeof req.body === 'object' ? req.body : typeof req.body === 'string' ? JSON.parse(req.body) : {}) as Record<string, any>;

    switch (action) {
      case 'key':
        return void res.status(200).json({ publicKey: (await vapid(d)).publicKey });

      case 'subscribe': {
        const s = body.subscription;
        const endpoint = str(s?.endpoint, 2000), p256dh = str(s?.keys?.p256dh, 200), auth = str(s?.keys?.auth, 100);
        if (!endpoint.startsWith('https://') || !p256dh || !auth) return void res.status(400).json({ error: 'Cadastro do aparelho inválido.' });
        await d.upsert('push_subscriptions', { endpoint, p256dh, auth }, 'endpoint');
        return void res.status(200).json({ ok: true });
      }

      case 'unsubscribe':
        await d.del('push_subscriptions', `endpoint=eq.${d.q(str(body.endpoint, 2000))}`);
        return void res.status(200).json({ ok: true });

      case 'schedule': {
        const list = Array.isArray(body.fires) ? body.fires.slice(0, MAX_FIRES) : [];
        const rows = list
          .filter((f: any) => typeof f?.key === 'string' && Number.isFinite(f?.fireAt))
          .map((f: any) => ({ key: str(f.key, 200), fire_at: new Date(f.fireAt).toISOString(), title: str(f.title, 200), body: str(f.body, 300), sent: false }));
        // troca tudo que ainda não foi enviado; o que já foi enviado fica e não é reenviado
        await d.del('scheduled', 'sent=eq.false');
        for (let i = 0; i < rows.length; i += 500) await d.upsert('scheduled', rows.slice(i, i + 500), 'key', true);
        return void res.status(200).json({ ok: true, count: rows.length });
      }

      case 'test': {
        const n = await pushAll(d, { title: 'Central de Rotina', body: 'Teste: se você está vendo isto, os avisos com o app fechado funcionam.', tag: `teste-${Date.now()}` });
        return void res.status(200).json({ ok: n > 0, sent: n, message: n > 0 ? '' : 'Nenhum aparelho cadastrado (ou o aparelho recusou). Ative os avisos no celular primeiro.' });
      }

      case 'status': {
        const subs = await d.get('push_subscriptions', 'select=endpoint');
        const pending = await d.get('scheduled', 'sent=eq.false&order=fire_at.asc&select=key,fire_at,title');
        const last = (await d.get('kv', 'name=eq.last_send&select=value'))[0];
        const denied = (await d.get('kv', 'name=eq.cron_denied&select=value'))[0];
        return void res.status(200).json({
          devices: subs.length,
          pending: pending.length,
          next: pending[0] ? { at: pending[0].fire_at, title: pending[0].title } : null,
          lastCron: last ? JSON.parse(last.value) : null,
          deniedAt: denied ? Number(denied.value) : null,
        });
      }

      case 'state-get': {
        const rows = await d.get('app_state', 'id=eq.1&select=data,updated_at_ms');
        return void res.status(200).json(rows[0] ? { state: rows[0].data, updatedAt: Number(rows[0].updated_at_ms) } : { state: null });
      }

      case 'state-put': {
        if (!body.state || typeof body.state !== 'object' || !Array.isArray(body.state.items)) return void res.status(400).json({ error: 'Dados inválidos.' });
        await d.upsert('app_state', { id: 1, data: body.state, updated_at_ms: Number(body.state.updatedAt) || Date.now() }, 'id');
        return void res.status(200).json({ ok: true });
      }

      default:
        return void res.status(400).json({ error: 'Ação desconhecida.' });
    }
  } catch (e) {
    // nunca registra chaves, endereços de aparelho nem dados da agenda
    console.error('push: falha', e instanceof Error ? e.message : String(e));
    return void res.status(502).json({ error: 'Não consegui falar com o banco de dados agora.' });
  }
}

