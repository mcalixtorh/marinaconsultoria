import { describe, expect, it } from 'vitest';
import type { Alarm, AppState, Item } from '../types';
import { addDays, addMonths, diffDays, greeting, longDate, startOfWeek, toTimestamp } from './dates';
import { NO_RECUR, nextOccurrence, occurrencesBetween, occursOn } from './recurrence';
import { alarmFires, dueFires, itemFires } from './reminders';
import { search, normalize } from './search';
import {
  displayStatus,
  isOverdue,
  overdueOccurrences,
  statsBetween,
  toOrganize,
  toggleDone,
  upcoming,
  reschedule,
} from './tasks';

function mk(p: Partial<Item>): Item {
  return {
    id: p.id ?? 'x',
    title: 't',
    desc: '',
    kind: 'tarefa',
    date: '2026-10-07',
    time: '',
    end: '',
    cat: 'rs',
    prio: 'media',
    status: 'pendente',
    rem: [],
    recur: NO_RECUR,
    link: '',
    src: 'teste',
    ...p,
  };
}

const TODAY = '2026-10-07'; // quarta-feira

describe('datas', () => {
  it('formata data longa e saudação', () => {
    expect(longDate(TODAY)).toBe('Quarta-feira, 07 de outubro');
    expect(greeting(8)).toBe('Bom dia');
    expect(greeting(14)).toBe('Boa tarde');
    expect(greeting(21)).toBe('Boa noite');
  });
  it('soma dias e meses sem estourar o mês', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(diffDays('2026-10-10', '2026-10-07')).toBe(3);
  });
  it('semana começa na segunda', () => {
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // domingo
  });
});

describe('recorrência', () => {
  it('não repete: só no dia', () => {
    const i = mk({});
    expect(occursOn(i, TODAY)).toBe(true);
    expect(occursOn(i, '2026-10-08')).toBe(false);
  });
  it('todos os dias, a partir do início', () => {
    const i = mk({ recur: { ...NO_RECUR, type: 'daily' } });
    expect(occursOn(i, '2026-10-06')).toBe(false);
    expect(occursOn(i, '2026-12-25')).toBe(true);
  });
  it('toda segunda-feira', () => {
    const i = mk({ date: '2026-10-05', recur: { ...NO_RECUR, type: 'weekly', weekdays: [1] } });
    expect(occurrencesBetween(i, '2026-10-05', '2026-10-26')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });
  it('toda semana sem dias usa o dia da semana do início', () => {
    const i = mk({ date: TODAY, recur: { ...NO_RECUR, type: 'weekly' } });
    expect(occursOn(i, '2026-10-14')).toBe(true);
    expect(occursOn(i, '2026-10-13')).toBe(false);
  });
  it('todo mês no dia 31 cai no último dia dos meses menores', () => {
    const i = mk({ date: '2026-01-31', recur: { ...NO_RECUR, type: 'monthly' } });
    expect(occursOn(i, '2026-02-28')).toBe(true);
    expect(occursOn(i, '2026-04-30')).toBe(true);
    expect(occursOn(i, '2026-04-29')).toBe(false);
  });
  it('todo dia 1º do mês', () => {
    const i = mk({ date: TODAY, recur: { ...NO_RECUR, type: 'month_first' } });
    expect(nextOccurrence(i, TODAY)).toBe('2026-11-01');
  });
  it('personalizado: a cada 3 dias, a cada 2 semanas, a cada 2 meses', () => {
    const d = mk({ recur: { ...NO_RECUR, type: 'custom', n: 3, unit: 'day' } });
    expect(occursOn(d, '2026-10-10')).toBe(true);
    expect(occursOn(d, '2026-10-11')).toBe(false);
    const w = mk({ recur: { ...NO_RECUR, type: 'custom', n: 2, unit: 'week' } });
    expect(occursOn(w, '2026-10-21')).toBe(true);
    expect(occursOn(w, '2026-10-14')).toBe(false);
    const m = mk({ recur: { ...NO_RECUR, type: 'custom', n: 2, unit: 'month' } });
    expect(occursOn(m, '2026-12-07')).toBe(true);
    expect(occursOn(m, '2026-11-07')).toBe(false);
  });
  it('item sem data nunca acontece', () => {
    expect(occursOn(mk({ date: '' }), TODAY)).toBe(false);
  });
});

describe('atrasados', () => {
  it('data passada e não concluído = atrasado', () => {
    expect(isOverdue(mk({ date: '2026-10-06' }), '2026-10-06', TODAY, 600)).toBe(true);
  });
  it('concluído não atrasa', () => {
    expect(isOverdue(mk({ date: '2026-10-06', status: 'concluido' }), '2026-10-06', TODAY, 600)).toBe(false);
  });
  it('hoje com horário passado: só tarefa atrasa', () => {
    const tarefa = mk({ time: '08:00' });
    const compromisso = mk({ time: '08:00', kind: 'compromisso' });
    expect(isOverdue(tarefa, TODAY, TODAY, 9 * 60)).toBe(true);
    expect(isOverdue(compromisso, TODAY, TODAY, 9 * 60)).toBe(false);
    expect(isOverdue(tarefa, TODAY, TODAY, 7 * 60)).toBe(false);
  });
  it('hoje sem horário não atrasa', () => {
    expect(isOverdue(mk({}), TODAY, TODAY, 23 * 60)).toBe(false);
  });
  it('item sem data nunca atrasa (fica em "A organizar")', () => {
    const i = mk({ date: '' });
    expect(isOverdue(i, '', TODAY, 600)).toBe(false);
    expect(displayStatus(i, '', TODAY, 600)).toBe('pendente');
    expect(overdueOccurrences([i], TODAY, 600)).toHaveLength(0);
  });
  it('lembrete nunca atrasa', () => {
    expect(isOverdue(mk({ kind: 'lembrete', date: '2026-10-01' }), '2026-10-01', TODAY, 0)).toBe(false);
  });
  it('recorrente mostra só a ocorrência atrasada mais recente', () => {
    const i = mk({ id: 'r', date: '2026-10-01', recur: { ...NO_RECUR, type: 'daily' } });
    const out = overdueOccurrences([i], TODAY, 600);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-10-06');
  });
  it('recorrente: concluir ontem tira do atrasado; antes de ontem continua contando', () => {
    let i = mk({ id: 'r', date: '2026-10-01', recur: { ...NO_RECUR, type: 'daily' } });
    i = toggleDone(i, '2026-10-06');
    expect(overdueOccurrences([i], TODAY, 600)[0].date).toBe('2026-10-05');
    expect(i.doneDates).toEqual(['2026-10-06']);
  });
  it('status exibido: atrasado é calculado', () => {
    const i = mk({ date: '2026-10-06', status: 'andamento' });
    expect(displayStatus(i, i.date, TODAY, 600)).toBe('atrasado');
    expect(displayStatus(mk({ status: 'andamento' }), TODAY, TODAY, 600)).toBe('andamento');
  });
});

describe('tarefas', () => {
  it('toggle conclui e desfaz item único', () => {
    const i = mk({});
    expect(toggleDone(i, TODAY).status).toBe('concluido');
    expect(toggleDone(toggleDone(i, TODAY), TODAY).status).toBe('pendente');
  });
  it('itens sem data vão para "A organizar"', () => {
    const list = [mk({ id: 'a', date: '' }), mk({ id: 'b' }), mk({ id: 'c', date: '', status: 'concluido' })];
    expect(toOrganize(list).map((i) => i.id)).toEqual(['a']);
  });
  it('reagendar muda a data; recorrente não é reagendado; concluído volta a pendente', () => {
    expect(reschedule(mk({}), '2026-10-08').date).toBe('2026-10-08');
    const rec = mk({ recur: { ...NO_RECUR, type: 'daily' } });
    expect(reschedule(rec, '2026-10-08')).toBe(rec);
    expect(reschedule(mk({ status: 'concluido' }), '2026-10-08').status).toBe('pendente');
  });
  it('estatísticas ignoram lembretes', () => {
    const items = [
      mk({ id: '1', status: 'concluido' }),
      mk({ id: '2' }),
      mk({ id: '3', date: '2026-10-06' }),
      mk({ id: '4', kind: 'lembrete' }),
    ];
    expect(statsBetween(items, '2026-10-05', '2026-10-11', TODAY, 600)).toEqual({ total: 3, done: 1, pending: 1, overdue: 1 });
  });
  it('próximos: só com horário, ordenados, sem o que já passou hoje', () => {
    const items = [
      mk({ id: 'passou', time: '08:00', kind: 'compromisso' }),
      mk({ id: 'tarde', time: '17:30', kind: 'compromisso' }),
      mk({ id: 'amanha', date: '2026-10-08', time: '09:00' }),
      mk({ id: 'semhora' }),
      mk({ id: 'longe', date: '2026-12-01', time: '09:00' }),
    ];
    expect(upcoming(items, TODAY, 12 * 60).map((o) => o.item.id)).toEqual(['tarde', 'amanha']);
  });
});

describe('lembretes e alarmes', () => {
  const at = (date: string, time: string) => toTimestamp(date, time);
  const entrevista = mk({ id: 'e', kind: 'compromisso', time: '14:00', rem: [1440, 60, 30, 0] });

  it('dispara cada antecedência no momento certo', () => {
    const fires = itemFires([entrevista], at('2026-10-06', '00:00'), at('2026-10-07', '23:59'));
    const times = fires.map((f) => f.fireAt);
    expect(times).toContain(at('2026-10-06', '14:00')); // 1 dia antes
    expect(times).toContain(at('2026-10-07', '13:00')); // 1 h antes
    expect(times).toContain(at('2026-10-07', '13:30')); // 30 min antes
    expect(times).toContain(at('2026-10-07', '14:00')); // no horário
    expect(fires).toHaveLength(4);
  });
  it('janela é aberta no início e fechada no fim (sem disparo duplo)', () => {
    const f = at('2026-10-07', '13:30');
    expect(itemFires([entrevista], f, f + 60000).filter((x) => x.fireAt === f)).toHaveLength(0);
    expect(itemFires([entrevista], f - 1, f).filter((x) => x.fireAt === f)).toHaveLength(1);
  });
  it('item concluído ou sem horário não avisa', () => {
    const feito = mk({ time: '14:00', rem: [0], status: 'concluido' });
    const semHora = mk({ rem: [0] });
    expect(itemFires([feito, semHora], at('2026-10-07', '00:00'), at('2026-10-08', '00:00'))).toHaveLength(0);
  });
  it('lembretes de recorrente disparam por ocorrência', () => {
    const r = mk({ time: '09:00', rem: [10], recur: { ...NO_RECUR, type: 'daily' } });
    const fires = itemFires([r], at('2026-10-07', '00:00'), at('2026-10-09', '23:59'));
    expect(fires.map((f) => f.key)).toEqual(['i|x|2026-10-07|10', 'i|x|2026-10-08|10', 'i|x|2026-10-09|10']);
  });
  const acordar: Alarm = { id: 'a', time: '07:00', name: 'Acordar', days: [1, 2, 3, 4, 5], repeat: true, enabled: true };
  it('alarme toca só nos dias escolhidos e se ativo', () => {
    const fires = alarmFires([acordar], at('2026-10-09', '00:00'), at('2026-10-12', '23:59')); // sex a seg
    expect(fires.map((f) => f.key)).toEqual(['a|a|2026-10-09', 'a|a|2026-10-12']);
    expect(alarmFires([{ ...acordar, enabled: false }], at('2026-10-09', '00:00'), at('2026-10-12', '23:59'))).toHaveLength(0);
  });
  it('alarme "uma vez" sem dias toca no próximo horário', () => {
    const once: Alarm = { ...acordar, days: [], repeat: false };
    const fires = alarmFires([once], at('2026-10-07', '08:00'), at('2026-10-08', '08:00'));
    expect(fires.map((f) => f.key)).toEqual(['a|a|2026-10-08']);
  });
  it('soneca entra nos avisos devidos', () => {
    const state = { items: [], alarms: [], snoozes: [{ id: 's1', alarmId: 'a', name: 'Acordar', at: at('2026-10-07', '07:05') }] } as unknown as AppState;
    const due = dueFires(state, at('2026-10-07', '07:00'), at('2026-10-07', '07:06'));
    expect(due).toHaveLength(1);
    expect(due[0].ring).toBe(true);
  });
});

describe('busca', () => {
  const state = {
    categories: [{ id: 'rs', name: 'Recrutamento & Seleção', group: 'trabalho', color: '' }],
    items: [mk({ id: '1', title: 'Retornar Gabriella', desc: 'vaga de RH' }), mk({ id: '2', title: 'Outro', person: 'GABRIÉLLA Souza' })],
    routines: [{ id: 'r', name: 'Rotina', steps: [{ id: 's', t: 'Ligar para a Gabriella' }], done: {} }],
    notes: [{ id: 'n', at: 0, text: 'Pedir currículo da gabriella' }],
  } as unknown as AppState;
  it('ignora acento e maiúscula e acha em tarefas, rotinas e notas', () => {
    const r = search(state, 'Gabriélla');
    expect(r.items.map((i) => i.id)).toEqual(['1', '2']);
    const r2 = search(state, 'gabriella');
    expect(r2.items).toHaveLength(2);
    expect(r2.routines).toHaveLength(1);
    expect(r2.notes).toHaveLength(1);
  });
  it('acha pelo nome da categoria e exige todos os termos', () => {
    expect(search(state, 'selecao').items).toHaveLength(2);
    expect(search(state, 'gabriella outro').items.map((i) => i.id)).toEqual(['2']);
    expect(search(state, '   ').items).toHaveLength(0);
    expect(normalize('Ação')).toBe('acao');
  });
});
