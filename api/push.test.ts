import { beforeEach, describe, expect, it, vi } from 'vitest';

const wp = vi.hoisted(() => ({
  generateVAPIDKeys: vi.fn(() => ({ publicKey: 'PUB-KEY', privateKey: 'PRIV-KEY' })),
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(async (..._args: unknown[]) => ({ statusCode: 201 })),
}));
vi.mock('web-push', () => ({ default: wp }));

import handler from './push';

// ---- Supabase falso, só com o que a função usa (PostgREST em memória) ----
type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const SUPA = 'https://projeto.supabase.co';
const SERVICE_KEY = 'CHAVE-DE-SERVICO-SECRETA';

function fakeFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url.toString());
  const table = u.pathname.replace('/rest/v1/', '');
  const rows = (tables[table] ??= []);
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(init.body as string) : null;
  const prefer = ((init.headers as Record<string, string>)?.Prefer ?? '');
  const pass = (r: Row) => {
    for (const [k, v] of u.searchParams) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...rest] = v.split('.');
      const val = rest.join('.');
      const cell = String(r[k]);
      if (op === 'eq' && cell !== val) return false;
      if (op === 'lte' && !(cell <= val)) return false;
    }
    return true;
  };
  const json = (data: unknown, status = 200) => Promise.resolve(data === null ? new Response(null, { status }) : new Response(JSON.stringify(data), { status }));
  if ((init.headers as Record<string, string>)?.apikey !== SERVICE_KEY) return json({ message: 'sem permissão' }, 401);
  if (method === 'GET') {
    let out = rows.filter(pass);
    if (u.searchParams.get('order')?.startsWith('fire_at')) out = [...out].sort((a, b) => a.fire_at.localeCompare(b.fire_at));
    return json(out.slice(0, Number(u.searchParams.get('limit') ?? 1000)));
  }
  if (method === 'POST') {
    const conflict = u.searchParams.get('on_conflict')!;
    for (const r of Array.isArray(body) ? body : [body]) {
      const i = rows.findIndex((x) => x[conflict] === r[conflict]);
      if (i < 0) rows.push({ ...r });
      else if (prefer.includes('resolution=merge')) rows[i] = { ...rows[i], ...r };
    }
    return json(null, 201);
  }
  if (method === 'DELETE') { tables[table] = rows.filter((r) => !pass(r)); return json(null, 204); }
  if (method === 'PATCH') {
    const hit = rows.filter(pass);
    hit.forEach((r) => Object.assign(r, body));
    return json(hit);
  }
  return json(null, 400);
}

function call(action: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; json: any }>((done) => {
    const res = { code: 200, status(c: number) { this.code = c; return this; }, setHeader() {}, json(b: unknown) { done({ status: this.code, json: b }); } };
    void handler({ method: opts.method ?? 'POST', url: `/api/push?action=${action}`, headers: { 'x-passcode': 'senha', ...opts.headers }, body: opts.body }, res as never);
  });
}
const SUB = { endpoint: 'https://push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
const cron = () => ({ 'x-cron-secret': tables.kv.find((r) => r.name === 'cron_secret')!.value });

beforeEach(() => {
  tables = { kv: [{ name: 'cron_secret', value: 'SEGREDO-DO-AGENDADOR' }], push_subscriptions: [], scheduled: [], app_state: [] };
  process.env.ASSISTANT_PASSCODE = 'senha';
  process.env.SUPABASE_URL = SUPA;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.VAPID_SUBJECT = 'mailto:eu@exemplo.com';
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  wp.sendNotification.mockClear();
  wp.sendNotification.mockResolvedValue({ statusCode: 201 });
  wp.generateVAPIDKeys.mockClear();
});

describe('configuração e segurança', () => {
  it('sem as variáveis, diz exatamente quais faltam (só os nomes)', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VAPID_SUBJECT;
    const r = await call('status');
    expect(r.status).toBe(503);
    expect(r.json.missing).toEqual(['SUPABASE_SERVICE_ROLE_KEY', 'VAPID_SUBJECT']);
  });
  it('senha errada: 401; depois de 10 erros seguidos, bloqueia', async () => {
    let r = await call('status', { headers: { 'x-passcode': 'errada', 'x-forwarded-for': '9.9.9.9' } });
    expect(r.status).toBe(401);
    for (let i = 0; i < 9; i++) await call('status', { headers: { 'x-passcode': 'errada', 'x-forwarded-for': '9.9.9.9' } });
    r = await call('status', { headers: { 'x-passcode': 'senha', 'x-forwarded-for': '9.9.9.9' } });
    expect(r.status).toBe(429);
  });
  it('"send" só aceita o segredo do agendador; a senha do app NÃO serve', async () => {
    expect((await call('send', { headers: { 'x-passcode': 'senha' } })).status).toBe(401);
    expect((await call('send', { headers: { 'x-cron-secret': 'errado' } })).status).toBe(401);
    expect((await call('send', { headers: cron() })).status).toBe(200);
  });
  it('ação desconhecida e método inválido', async () => {
    expect((await call('apagar-tudo')).status).toBe(400);
    expect((await call('status', { method: 'DELETE' })).status).toBe(405);
  });
  it('a chave do banco nunca aparece nas respostas', async () => {
    const all = await Promise.all([call('key'), call('status'), call('test')]);
    expect(JSON.stringify(all)).not.toContain(SERVICE_KEY);
  });
  it('se o banco falhar, responde 502 sem vazar detalhes', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'outra-chave';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await call('status');
    expect(r.status).toBe(502);
    expect(JSON.stringify([r.json, spy.mock.calls])).not.toContain('outra-chave');
    spy.mockRestore();
  });
});

describe('chaves e aparelhos', () => {
  it('gera as chaves VAPID uma vez só e guarda no banco', async () => {
    expect((await call('key')).json.publicKey).toBe('PUB-KEY');
    expect((await call('key')).json.publicKey).toBe('PUB-KEY');
    expect(wp.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    expect(tables.kv.some((r) => r.name === 'vapid')).toBe(true);
  });
  it('cadastra o aparelho (sem duplicar) e recusa cadastro inválido', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('subscribe', { body: { subscription: SUB } });
    expect(tables.push_subscriptions).toHaveLength(1);
    expect((await call('subscribe', { body: { subscription: { endpoint: 'http://inseguro', keys: { p256dh: 'p', auth: 'a' } } } })).status).toBe(400);
    expect((await call('subscribe', { body: {} })).status).toBe(400);
  });
  it('descadastra o aparelho', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('unsubscribe', { body: { endpoint: SUB.endpoint } });
    expect(tables.push_subscriptions).toHaveLength(0);
  });
});

describe('agenda de avisos e envio', () => {
  const at = (ms: number) => Date.now() + ms;
  const fire = (key: string, ms: number) => ({ key, fireAt: at(ms), title: `T ${key}`, body: 'agora' });

  it('"schedule" troca os avisos pendentes e não reativa os já enviados', async () => {
    await call('schedule', { body: { fires: [fire('a', 60_000), fire('b', 120_000)] } });
    expect(tables.scheduled).toHaveLength(2);
    tables.scheduled.find((r) => r.key === 'a')!.sent = true;
    await call('schedule', { body: { fires: [fire('a', 60_000), fire('c', 180_000)] } });
    const byKey = Object.fromEntries(tables.scheduled.map((r) => [r.key, r.sent]));
    expect(byKey).toEqual({ a: true, c: false }); // b sumiu; a continua "enviado"
  });
  it('envia o que já está na hora, uma vez só, com a etiqueta do aviso', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('schedule', { body: { fires: [fire('i|x|2026-10-07|30', 1500), fire('futuro', 3_600_000)] } });
    tables.scheduled.find((r) => r.key === 'i|x|2026-10-07|30')!.fire_at = new Date(at(-5000)).toISOString(); // venceu há 5 s
    const r1 = await call('send', { headers: cron() });
    expect(r1.json).toMatchObject({ due: 1, sent: 1, skipped: 0 });
    const [sub, payload] = wp.sendNotification.mock.calls[0] as [any, string];
    expect(sub.endpoint).toBe(SUB.endpoint);
    expect(JSON.parse(payload)).toEqual({ title: 'T i|x|2026-10-07|30', body: 'agora', tag: 'i|x|2026-10-07|30' });
    const r2 = await call('send', { headers: cron() });
    expect(r2.json.sent).toBe(0); // não repete
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
    expect(tables.scheduled.find((r) => r.key === 'futuro')!.sent).toBe(false);
  });
  it('aviso atrasado demais (> 10 min) não é enviado, mas é marcado para não ficar preso', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('schedule', { body: { fires: [fire('velho', 1000)] } });
    tables.scheduled[0].fire_at = new Date(at(-20 * 60_000)).toISOString();
    const r = await call('send', { headers: cron() });
    expect(r.json).toMatchObject({ sent: 0, skipped: 1 });
    expect(wp.sendNotification).not.toHaveBeenCalled();
    expect(tables.scheduled[0].sent).toBe(true);
  });
  it('duas chamadas ao mesmo tempo não enviam em dobro', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('schedule', { body: { fires: [fire('k', 1000)] } });
    tables.scheduled[0].fire_at = new Date(at(-1000)).toISOString();
    await Promise.all([call('send', { headers: cron() }), call('send', { headers: cron() })]);
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
  });
  it('aparelho que cancelou (410) é removido; outros erros não apagam o cadastro', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    wp.sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    await call('test');
    expect(tables.push_subscriptions).toHaveLength(0);
    await call('subscribe', { body: { subscription: SUB } });
    wp.sendNotification.mockRejectedValueOnce(Object.assign(new Error('falha'), { statusCode: 500 }));
    await call('test');
    expect(tables.push_subscriptions).toHaveLength(1);
  });
  it('"test" avisa quando não há aparelho cadastrado', async () => {
    const r = await call('test');
    expect(r.json.ok).toBe(false);
    expect(r.json.message).toContain('Ative os avisos');
  });
  it('"status" conta aparelhos e avisos pendentes', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('schedule', { body: { fires: [fire('a', 1000), fire('b', 2000)] } });
    const st = (await call('status', { method: 'GET' })).json;
    expect(st).toMatchObject({ devices: 1, pending: 2, lastCron: null, deniedAt: null });
    expect(st.next.title).toBe('T a'); // o mais cedo
  });
  it('usa o assunto VAPID configurado', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('test');
    expect(wp.setVapidDetails).toHaveBeenCalledWith('mailto:eu@exemplo.com', 'PUB-KEY', 'PRIV-KEY');
  });
});

describe('diagnóstico do agendador', () => {
  it('registra quando o agendador chega e o que fez; "status" mostra', async () => {
    await call('subscribe', { body: { subscription: SUB } });
    await call('schedule', { body: { fires: [{ key: 'k', fireAt: Date.now() + 1000, title: 'T', body: '' }] } });
    tables.scheduled[0].fire_at = new Date(Date.now() - 1000).toISOString();
    await call('send', { headers: cron() });
    const st = (await call('status', { method: 'GET' })).json;
    expect(st.lastCron).toMatchObject({ due: 1, sent: 1, skipped: 0 });
    expect(Date.now() - st.lastCron.at).toBeLessThan(5000);
  });
  it('registra tentativas com segredo errado, sem aceitar', async () => {
    await call('send', { headers: { 'x-cron-secret': 'errado' } });
    const st = (await call('status', { method: 'GET' })).json;
    expect(st.deniedAt).toBeGreaterThan(0);
    expect(st.lastCron).toBeNull();
  });
});

describe('cópia dos dados na nuvem', () => {
  it('guarda e devolve o estado; recusa lixo', async () => {
    const state = { items: [{ id: 'x' }], updatedAt: 1234 };
    expect((await call('state-get', { method: 'GET' })).json.state).toBeNull();
    await call('state-put', { body: { state } });
    expect((await call('state-get', { method: 'GET' })).json).toEqual({ state, updatedAt: 1234 });
    expect((await call('state-put', { body: { state: { nada: 1 } } })).status).toBe(400);
  });
});
