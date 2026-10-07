import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { expandEvents } from './calendar';

const NOW = Date.UTC(2026, 9, 7, 11, 0); // 07/10/2026 08:00 em São Paulo
const wrap = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-TIMEZONE:America/Sao_Paulo\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`;
const ev = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const run = (...events: string[]) => expandEvents(wrap(...events), NOW).events;

describe('leitor do Google Agenda (iCal)', () => {
  it('evento com fuso de São Paulo, duração e link do Meet', () => {
    const [e] = run(ev(['UID:a1@google.com', 'DTSTART;TZID=America/Sao_Paulo:20261008T130000', 'DTEND;TZID=America/Sao_Paulo:20261008T133000', 'SUMMARY:Entrevista Gerente de Vendas - Fabiane', 'X-GOOGLE-CONFERENCE:https://meet.google.com/jwx-ixax-pxs', 'STATUS:CONFIRMED']));
    expect(e).toMatchObject({ id: 'gcal-a1@google.com', title: 'Entrevista Gerente de Vendas - Fabiane', date: '2026-10-08', time: '13:00', end: '13:30', link: 'https://meet.google.com/jwx-ixax-pxs', allDay: false });
  });
  it('horário em UTC e em outro fuso (Nova York, horário de verão) viram horário de São Paulo', () => {
    const list = run(
      ev(['UID:u', 'DTSTART:20261008T160000Z', 'DTEND:20261008T170000Z', 'SUMMARY:UTC']),
      ev(['UID:n', 'DTSTART;TZID=America/New_York:20261008T090000', 'DTEND;TZID=America/New_York:20261008T100000', 'SUMMARY:NY']),
    );
    expect(list.find((e) => e.title === 'UTC')).toMatchObject({ time: '13:00', end: '14:00' });
    expect(list.find((e) => e.title === 'NY')).toMatchObject({ time: '10:00', end: '11:00' });
  });
  it('fuso desconhecido cai no de São Paulo em vez de quebrar', () => {
    const [e] = run(ev(['UID:z', 'DTSTART;TZID=Fuso/Inventado:20261008T090000', 'SUMMARY:x']));
    expect(e.time).toBe('09:00');
  });
  it('dia inteiro não tem horário', () => {
    const [e] = run(ev(['UID:d', 'DTSTART;VALUE=DATE:20261014', 'DTEND;VALUE=DATE:20261015', 'SUMMARY:Lembrete: cartão']));
    expect(e).toMatchObject({ date: '2026-10-14', time: '', end: '', allDay: true });
  });
  it('cancelado não aparece; descrição com quebra de linha, vírgula e HTML é limpa', () => {
    const list = run(
      ev(['UID:c', 'DTSTART:20261009T120000Z', 'SUMMARY:Cancelado', 'STATUS:CANCELLED']),
      ev(['UID:t', 'DTSTART:20261009T120000Z', 'SUMMARY:Post\\, LinkedIn', 'DESCRIPTION:Linha 1\\nLinha <b>2</b>\\, ok', ' continuação dobrada']),
    );
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Post, LinkedIn');
    expect(list[0].description).toBe('Linha 1\nLinha 2, okcontinuação dobrada');
  });
  it('repetição semanal com data excluída e uma exceção remarcada', () => {
    const list = run(
      ev(['UID:w', 'DTSTART;TZID=America/Sao_Paulo:20261005T090000', 'DTEND;TZID=America/Sao_Paulo:20261005T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=America/Sao_Paulo:20261019T090000', 'SUMMARY:Reunião semanal']),
      ev(['UID:w', 'RECURRENCE-ID;TZID=America/Sao_Paulo:20261026T090000', 'DTSTART;TZID=America/Sao_Paulo:20261027T140000', 'DTEND;TZID=America/Sao_Paulo:20261027T143000', 'SUMMARY:Reunião semanal (remarcada)']),
    );
    const dates = list.map((e) => `${e.date} ${e.time} ${e.title}`);
    expect(dates).toContain('2026-10-12 09:00 Reunião semanal');
    expect(dates).not.toContain('2026-10-19 09:00 Reunião semanal'); // excluída
    expect(dates).not.toContain('2026-10-26 09:00 Reunião semanal'); // virou exceção
    expect(dates).toContain('2026-10-27 14:00 Reunião semanal (remarcada)');
    expect(dates).toContain('2026-11-02 09:00 Reunião semanal');
    expect(list.find((e) => e.date === '2026-10-27')!.id).toBe('gcal-w-202610260900'); // id segue o dia original
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
  });
  it('mensal com limite de ocorrências e "todo dia 1º"', () => {
    const m = run(ev(['UID:m', 'DTSTART;TZID=America/Sao_Paulo:20261026T190000', 'DTEND;TZID=America/Sao_Paulo:20261026T193000', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=26;COUNT=2', 'SUMMARY:Ritual']));
    expect(m.map((e) => e.date)).toEqual(['2026-10-26', '2026-11-26']);
    const first = run(ev(['UID:f', 'DTSTART;VALUE=DATE:20261101', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1', 'SUMMARY:Mês novo']));
    expect(first.slice(0, 3).map((e) => e.date)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });
  it('regra de repetição ilegível mostra só o primeiro evento, sem quebrar', () => {
    const list = run(ev(['UID:r', 'DTSTART:20261008T120000Z', 'RRULE:FREQ=BANANA', 'SUMMARY:Estranho']));
    expect(list).toHaveLength(1);
  });
  it('só traz a janela: 14 dias para trás e 120 para frente', () => {
    const list = run(
      ev(['UID:old', 'DTSTART:20260801T120000Z', 'SUMMARY:muito antigo']),
      ev(['UID:ok', 'DTSTART:20260925T120000Z', 'SUMMARY:dentro']),
      ev(['UID:far', 'DTSTART:20270601T120000Z', 'SUMMARY:muito longe']),
    );
    expect(list.map((e) => e.title)).toEqual(['dentro']);
  });
  it('ordena por data e horário', () => {
    const list = run(ev(['UID:2', 'DTSTART:20261009T150000Z', 'SUMMARY:depois']), ev(['UID:1', 'DTSTART:20261008T150000Z', 'SUMMARY:antes']));
    expect(list.map((e) => e.title)).toEqual(['antes', 'depois']);
  });
});

describe('função /api/calendar', () => {
  const SECRET = 'https://calendar.google.com/calendar/ical/x%40gmail.com/private-SEGREDO123/basic.ics';
  const call = (headers: Record<string, string> = { 'x-passcode': 'senha' }, method = 'GET') =>
    new Promise<{ status: number; json: any }>((done) => {
      const res = { code: 200, status(c: number) { this.code = c; return this; }, setHeader() {}, json(b: unknown) { done({ status: this.code, json: b }); } };
      void handler({ method, headers }, res as never);
    });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.ASSISTANT_PASSCODE = 'senha';
    process.env.ICAL_URL = SECRET;
    fetchMock = vi.fn(async () => new Response(wrap(ev(['UID:q', `DTSTART:20261008T160000Z`, 'SUMMARY:Teste'])), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sem ICAL_URL ou senha no servidor: 503 e nada é buscado', async () => {
    delete process.env.ICAL_URL;
    expect((await call()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('senha errada: 401 e nada é buscado', async () => {
    expect((await call({ 'x-passcode': 'x' })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('só aceita endereços do Google Agenda (não vira proxy aberto)', async () => {
    process.env.ICAL_URL = 'https://evil.example.com/a.ics';
    const r = await call();
    expect(r.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.ICAL_URL = 'http://calendar.google.com/a.ics';
    expect((await call()).status).toBe(500);
  });
  it('sucesso: devolve eventos e janela, e o endereço secreto nunca aparece na resposta', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.json.events).toHaveLength(1);
    expect(r.json.window.from < r.json.window.to).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain('SEGREDO123');
    expect(fetchMock.mock.calls[0][0].toString()).toBe(SECRET);
  });
  it('Google recusa (link redefinido) ou devolve outra coisa: erro claro, sem vazar o link', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    let r = await call();
    expect(r.status).toBe(502);
    expect(r.json.error).toContain('redefinido');
    fetchMock.mockResolvedValueOnce(new Response('<html>login</html>', { status: 200 }));
    r = await call();
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain('SEGREDO123');
  });
  it('falha de rede não derruba nem vaza', async () => {
    fetchMock.mockRejectedValueOnce(new Error(`falhou ${SECRET}`));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await call();
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain('SEGREDO123');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('SEGREDO123');
    spy.mockRestore();
  });
});
