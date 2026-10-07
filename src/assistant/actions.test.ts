import { describe, expect, it } from 'vitest';
import { seedState } from '../lib/seed';
import { applyPlan, buildContext, planActions } from './actions';

const NOW = new Date(2026, 9, 7, 8, 0);
const TODAY = '2026-10-07';
const fresh = () => seedState(NOW.getTime());
const plan = (raw: unknown[]) => planActions(fresh(), raw, TODAY);

describe('contexto enviado à IA', () => {
  it('traz data de hoje, categorias, itens com id e alarmes, sem descrições longas', () => {
    const c = buildContext(fresh(), NOW);
    expect(c).toContain('HOJE: 2026-10-07 (Quarta-feira)');
    expect(c).toContain('e-beatriz | compromisso | 2026-10-07 | 10:30');
    expect(c).toContain('Entrevista Recepcionista - Beatriz');
    expect(c).toContain('rs=Recrutamento & Seleção');
    expect(c).toContain('a1 | 07:00');
    expect(c).not.toContain('Eu sei porque já estive do outro lado'); // texto do post não vai
  });
  it('não manda itens muito antigos', () => {
    const s = fresh();
    s.items.push({ ...s.items[0], id: 'velho', date: '2025-01-01' });
    expect(buildContext(s, NOW)).not.toContain('velho |');
  });
});

describe('cancelar (apagar) exige confirmação e avisa do Google Agenda', () => {
  it('"cancelar a entrevista da Beatriz"', () => {
    const p = plan([{ type: 'delete_item', id: 'e-beatriz' }]);
    expect(p.destructive).toBe(true);
    expect(p.lines[0]).toContain('Entrevista Recepcionista - Beatriz');
    expect(p.warnings.join(' ')).toContain('Google Agenda');
    const after = applyPlan(fresh(), p);
    expect(after.items.find((i) => i.id === 'e-beatriz')).toBeUndefined();
    expect(after.items.length).toBe(fresh().items.length - 1);
  });
  it('id inexistente é recusado, nada é apagado', () => {
    const p = plan([{ type: 'delete_item', id: 'nao-existe' }]);
    expect(p.actions).toHaveLength(0);
    expect(p.problems[0]).toContain('Não encontrei');
    expect(applyPlan(fresh(), p).items.length).toBe(fresh().items.length);
  });
  it('não altera um item que o mesmo comando acabou de apagar', () => {
    const p = plan([{ type: 'delete_item', id: 'e-adla' }, { type: 'update_item', id: 'e-adla', time: '11:00' }]);
    expect(p.actions).toHaveLength(1);
  });
  it('excluir alarme também pede confirmação', () => {
    const p = plan([{ type: 'delete_alarm', id: 'a2' }]);
    expect(p.destructive).toBe(true);
    expect(applyPlan(fresh(), p).alarms.map((a) => a.id)).toEqual(['a1', 'a3']);
  });
});

describe('remarcar e editar', () => {
  it('"passar a reunião do Leonardo para amanhã às 15h"', () => {
    const p = plan([{ type: 'update_item', id: 'cl-leo', date: '2026-10-08', time: '15:00' }]);
    expect(p.destructive).toBe(false);
    const item = applyPlan(fresh(), p).items.find((i) => i.id === 'cl-leo')!;
    expect(item.date).toBe('2026-10-08');
    expect(item.time).toBe('15:00');
    expect(item.rem).toEqual([30]); // lembretes originais continuam
  });
  it('tirar o horário apaga os lembretes (lembrete precisa de horário)', () => {
    const item = applyPlan(fresh(), plan([{ type: 'update_item', id: 'cl-leo', time: '' }])).items.find((i) => i.id === 'cl-leo')!;
    expect(item.time).toBe('');
    expect(item.rem).toEqual([]);
  });
  it('data e horário inválidos são recusados', () => {
    expect(plan([{ type: 'update_item', id: 'cl-leo', date: '2026-02-31' }]).actions).toHaveLength(0);
    expect(plan([{ type: 'update_item', id: 'cl-leo', time: '25:00' }]).actions).toHaveLength(0);
    expect(plan([{ type: 'update_item', id: 'cl-leo' }]).problems[0]).toContain('Não entendi');
  });
});

describe('criar', () => {
  it('cria compromisso com horário, lembrete e categoria válida', () => {
    const p = plan([{ type: 'create_item', title: 'Ligar para a Gabriella', date: '2026-10-08', time: '14:00', category: 'candidatos', reminders_minutes: [30, 999], person: 'Gabriella' }]);
    const s = applyPlan(fresh(), p);
    const it = s.items[s.items.length - 1];
    expect(it).toMatchObject({ title: 'Ligar para a Gabriella', date: '2026-10-08', time: '14:00', cat: 'candidatos', rem: [30], person: 'Gabriella', kind: 'compromisso', src: 'Assistente' });
  });
  it('categoria inventada cai numa categoria que existe; sem data vai para "A organizar"', () => {
    const s = applyPlan(fresh(), plan([{ type: 'create_item', title: 'Estudar', category: 'inventada' }]));
    const it = s.items[s.items.length - 1];
    expect(s.categories.some((c) => c.id === it.cat)).toBe(true);
    expect(it.date).toBe('');
  });
  it('recorrência sem data é recusada', () => {
    expect(plan([{ type: 'create_item', title: 'Revisar', recurrence: { type: 'daily' } }]).problems[0]).toContain('data de início');
  });
  it('sem título é recusado', () => {
    expect(plan([{ type: 'create_item', title: '   ' }]).actions).toHaveLength(0);
  });
  it('alarme e anotação', () => {
    const s = applyPlan(fresh(), plan([{ type: 'create_alarm', time: '09:30', name: 'Fazer café', days: [1, 2], repeat: true }, { type: 'add_note', text: 'Pedir currículo da Gabriella' }]));
    expect(s.alarms[s.alarms.length - 1]).toMatchObject({ time: '09:30', name: 'Fazer café', days: [1, 2], repeat: true, enabled: true });
    expect(s.notes[s.notes.length - 1].text).toBe('Pedir currículo da Gabriella');
  });
});

describe('concluir', () => {
  it('conclui e é idempotente', () => {
    const p = plan([{ type: 'complete_item', id: 'e-adla' }]);
    const s = applyPlan(fresh(), p);
    expect(s.items.find((i) => i.id === 'e-adla')!.status).toBe('concluido');
    expect(planActions(s, [{ type: 'complete_item', id: 'e-adla' }], TODAY).actions).toHaveLength(0);
  });
  it('reabre um concluído', () => {
    const s = applyPlan(fresh(), plan([{ type: 'complete_item', id: 'e-gilka', done: false }]));
    expect(s.items.find((i) => i.id === 'e-gilka')!.status).toBe('pendente');
  });
});

describe('robustez', () => {
  it('lixo na resposta da IA não quebra nada', () => {
    const p = plan([null, 5, 'x', { type: 'apagar_tudo' }, { type: 'delete_item' }, {}]);
    expect(p.actions).toHaveLength(0);
    expect(applyPlan(fresh(), p).items).toHaveLength(fresh().items.length);
  });
  it('limita a 20 ações por comando', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ type: 'add_note', text: `n${i}` }));
    expect(plan(many).actions).toHaveLength(20);
  });
});
