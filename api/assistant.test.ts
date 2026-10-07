import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import handler from './assistant';

// Servidor falso que imita a API da Anthropic (não gasta nada e não usa chave real).
let fake: Server;
let received: { url: string; headers: IncomingMessage['headers']; body: any }[] = [];
let reply: unknown;

beforeAll(async () => {
  fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(raw || '{}') });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((ok) => fake.listen(0, ok));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => fake.close());

const message = (content: unknown[], stop = 'tool_use') => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason: stop, stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
});

function call(body: unknown, headers: Record<string, string> = { 'x-passcode': 'segredo' }, method = 'POST') {
  return new Promise<{ status: number; json: any }>((done) => {
    const res = {
      code: 200,
      status(c: number) { this.code = c; return this; },
      setHeader() {},
      json(b: unknown) { done({ status: this.code, json: b }); },
    };
    void handler({ method, headers, body }, res as never);
  });
}

beforeEach(() => {
  received = [];
  process.env.ANTHROPIC_API_KEY = 'chave-de-teste';
  process.env.ASSISTANT_PASSCODE = 'segredo';
  delete process.env.ASSISTANT_MODEL;
  reply = message([{ type: 'text', text: 'Vou cancelar.' }, { type: 'tool_use', id: 'toolu_1', name: 'delete_item', input: { id: 'e-beatriz' } }]);
});

describe('função do assistente', () => {
  it('sem chave ou senha no servidor, recusa tudo (503)', async () => {
    delete process.env.ASSISTANT_PASSCODE;
    const r = await call({ command: 'oi', context: '' });
    expect(r.status).toBe(503);
    expect(r.json.code).toBe('not_configured');
    expect(received).toHaveLength(0);
  });
  it('senha errada ou ausente: 401 e a IA nem é chamada', async () => {
    expect((await call({ command: 'oi', context: '' }, { 'x-passcode': 'errada' })).status).toBe(401);
    expect((await call({ command: 'oi', context: '' }, {})).status).toBe(401);
    expect(received).toHaveLength(0);
  });
  it('só aceita POST', async () => {
    expect((await call({}, { 'x-passcode': 'segredo' }, 'GET')).status).toBe(405);
  });
  it('rejeita comando vazio ou grande demais', async () => {
    expect((await call({ command: '   ', context: '' })).status).toBe(400);
    expect((await call({ command: 'x'.repeat(601), context: '' })).status).toBe(400);
    expect((await call({ command: 'ok', context: 'x'.repeat(60_001) })).status).toBe(400);
    expect(received).toHaveLength(0);
  });
  it('devolve a mensagem e as ações propostas pela IA', async () => {
    const r = await call({ command: 'cancelar a entrevista da Beatriz', context: 'HOJE: 2026-10-07\nITENS...' });
    expect(r.status).toBe(200);
    expect(r.json.message).toBe('Vou cancelar.');
    expect(r.json.actions).toEqual([{ id: 'e-beatriz', type: 'delete_item' }]);
  });
  it('envia o pedido certo à API: modelo, ferramentas, contexto, comando, senha não vaza', async () => {
    await call({ command: 'cancelar a entrevista da Beatriz', context: 'HOJE: 2026-10-07\nITEM e-beatriz' });
    expect(received).toHaveLength(1);
    const { url, headers, body } = received[0];
    expect(url).toContain('/v1/messages');
    expect(headers['x-api-key']).toBe('chave-de-teste');
    expect(String(headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.tool_choice).toEqual({ type: 'auto' }); // forçar ferramenta dá erro nesse modelo
    expect(body.thinking).toBeUndefined();
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual(['create_item', 'update_item', 'complete_item', 'delete_item', 'create_alarm', 'delete_alarm', 'add_note']);
    const user = body.messages[0].content as string;
    expect(user).toContain('ITEM e-beatriz');
    expect(user).toContain('PEDIDO DA MARINA: cancelar a entrevista da Beatriz');
    expect(JSON.stringify(body)).not.toContain('segredo');
    expect(body.system).toContain('SOMENTE ids que aparecem nos dados');
  });
  it('permite trocar o modelo; modelos antigos não recebem effort nem fallbacks', async () => {
    process.env.ASSISTANT_MODEL = 'claude-haiku-4-5';
    await call({ command: 'oi', context: '' });
    const { body, headers } = received[0];
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.output_config).toBeUndefined();
    expect(body.fallbacks).toBeUndefined();
    expect(String(headers['anthropic-beta'] ?? '')).not.toContain('fallback');
  });
  it('resposta só com texto (pergunta de volta) vira mensagem sem ações', async () => {
    reply = message([{ type: 'text', text: 'Qual Beatriz?' }], 'end_turn');
    const r = await call({ command: 'cancelar a Beatriz', context: '' });
    expect(r.json).toEqual({ message: 'Qual Beatriz?', actions: [] });
  });
  it('recusa da IA vira mensagem educada', async () => {
    reply = message([], 'refusal');
    expect((await call({ command: 'x', context: '' })).json.actions).toEqual([]);
  });
});
