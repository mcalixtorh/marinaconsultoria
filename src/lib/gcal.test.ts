import { describe, expect, it } from 'vitest';
import { seedState } from './seed';
import { addIgnored, guessCategory, guessKind, mergeCalendar, type GcalEvent } from './gcal';
import { applyPlan, planActions } from '../assistant/actions';

const NOW = new Date(2026, 9, 7, 8, 0).getTime();
const TODAY = '2026-10-07';
const WIN = { from: '2026-09-23', to: '2027-02-04' };
const ev = (p: Partial<GcalEvent>): GcalEvent => ({ id: 'gcal-x', title: 'Reunião', description: '', location: '', date: '2026-10-09', time: '10:00', end: '10:30', link: '', allDay: false, ...p });
const fresh = () => seedState(NOW);

describe('juntar o Google Agenda ao app', () => {
  it('evento novo vira item, com categoria, tipo e lembrete padrão', () => {
    const r = mergeCalendar(fresh(), [ev({ id: 'gcal-n1', title: 'Entrevista Analista - Carla', link: 'https://meet.google.com/aaa-bbbb-ccc' })], WIN, TODAY, NOW);
    const it = r.state.items.find((i) => i.ext === 'gcal-n1')!;
    expect(r.added).toBe(1);
    expect(it).toMatchObject({ title: 'Entrevista Analista - Carla', date: '2026-10-09', time: '10:00', end: '10:30', kind: 'compromisso', cat: 'entrevistas', rem: [30], src: 'Google Agenda', status: 'pendente', link: 'https://meet.google.com/aaa-bbbb-ccc' });
  });
  it('itens já importados no começo NÃO duplicam: são reconhecidos por título + data + horário', () => {
    const s = fresh();
    const before = s.items.length;
    const r = mergeCalendar(s, [ev({ id: 'gcal-beatriz', title: 'Entrevista Recepcionista - Beatriz', date: '2026-10-07', time: '10:30', end: '11:00' })], WIN, TODAY, NOW);
    expect(r.added).toBe(0);
    expect(r.state.items.length).toBe(before);
    expect(r.state.items.find((i) => i.id === 'e-beatriz')!.ext).toBe('gcal-beatriz');
  });
  it('segunda leitura igual não muda nada (não duplica, não mexe no updatedAt)', () => {
    const events = [ev({ id: 'gcal-n1', title: 'Novo' })];
    const a = mergeCalendar(fresh(), events, WIN, TODAY, NOW);
    const b = mergeCalendar(a.state, events, WIN, TODAY, NOW + 60000);
    expect(b).toMatchObject({ added: 0, updated: 0, removed: 0 });
    expect(b.state.items).toEqual(a.state.items);
    expect(b.state.updatedAt).toBe(a.state.updatedAt);
  });
  it('se o horário muda no Google, muda no app; o que é do app (concluído, categoria, prioridade) fica', () => {
    const a = mergeCalendar(fresh(), [ev({ id: 'gcal-n1', title: 'Novo' })], WIN, TODAY, NOW);
    const id = a.state.items.find((i) => i.ext === 'gcal-n1')!.id;
    const edited = { ...a.state, items: a.state.items.map((i) => (i.id === id ? { ...i, status: 'concluido' as const, prio: 'alta' as const, cat: 'clientes' } : i)) };
    const b = mergeCalendar(edited, [ev({ id: 'gcal-n1', title: 'Novo', date: '2026-10-10', time: '15:00', end: '15:30' })], WIN, TODAY, NOW);
    expect(b.updated).toBe(1);
    expect(b.state.items.find((i) => i.id === id)).toMatchObject({ date: '2026-10-10', time: '15:00', status: 'concluido', prio: 'alta', cat: 'clientes' });
  });
  it('evento apagado no Google some do app (só os futuros); passados ficam', () => {
    const a = mergeCalendar(fresh(), [ev({ id: 'gcal-fut', date: '2026-10-20' }), ev({ id: 'gcal-pas', title: 'Passado', date: '2026-09-30' })], WIN, TODAY, NOW);
    const b = mergeCalendar(a.state, [ev({ id: 'gcal-outro', title: 'Outro', date: '2026-10-21' })], WIN, TODAY, NOW);
    const ext = b.state.items.map((i) => i.ext);
    expect(ext).not.toContain('gcal-fut');
    expect(ext).toContain('gcal-pas');
    expect(b.removed).toBe(1);
  });
  it('leitura vazia nunca apaga nada', () => {
    const a = mergeCalendar(fresh(), [ev({ id: 'gcal-n1' })], WIN, TODAY, NOW);
    const b = mergeCalendar(a.state, [], WIN, TODAY, NOW);
    expect(b.removed).toBe(0);
    expect(b.state.items.some((i) => i.ext === 'gcal-n1')).toBe(true);
  });
  it('o que a Marina apagou aqui não volta na próxima leitura', () => {
    const a = mergeCalendar(fresh(), [ev({ id: 'gcal-n1', title: 'Vai cancelar' })], WIN, TODAY, NOW);
    const id = a.state.items.find((i) => i.ext === 'gcal-n1')!.id;
    const plan = planActions(a.state, [{ type: 'delete_item', id }], TODAY);
    const cancelled = applyPlan(a.state, plan, NOW);
    expect(cancelled.gcal!.ignored).toContain('gcal-n1');
    const b = mergeCalendar(cancelled, [ev({ id: 'gcal-n1', title: 'Vai cancelar' })], WIN, TODAY, NOW);
    expect(b.added).toBe(0);
    expect(b.state.items.some((i) => i.ext === 'gcal-n1')).toBe(false);
  });
  it('tombstone não duplica ids e respeita o limite', () => {
    let g = addIgnored(undefined, 'a');
    g = addIgnored(g, 'a');
    expect(g.ignored).toEqual(['a']);
  });
  it('dia inteiro: tarefa sem horário, sem lembrete; "Lembrete:" vira lembrete', () => {
    const r = mergeCalendar(fresh(), [ev({ id: 'gcal-d', title: 'Lembrete: pagar boleto', time: '', end: '', allDay: true })], WIN, TODAY, NOW);
    expect(r.state.items.find((i) => i.ext === 'gcal-d')).toMatchObject({ kind: 'lembrete', rem: [], time: '', cat: 'financeiro' });
  });
  it('palpites de categoria e tipo', () => {
    const ok = () => true;
    expect(guessCategory(ev({ title: 'Conteúdo Dia 9 — Bastidores' }), ok)).toBe('conteudo');
    expect(guessCategory(ev({ title: 'Consulta Pediatria - Alice' }), ok)).toBe('alice');
    expect(guessCategory(ev({ title: 'Qualquer coisa' }), ok)).toBe('compromissos');
    expect(guessCategory(ev({ title: 'Entrevista X' }), () => false)).toBe('rs'); // categoria inexistente: não quebra
    expect(guessKind(ev({ title: 'Publicar no LinkedIn: algo' }))).toBe('tarefa');
    expect(guessKind(ev({ title: 'Reunião com cliente' }))).toBe('compromisso');
  });
  it('com a carga inicial real: leitura com os mesmos eventos não cria nenhum duplicado', () => {
    const s = fresh();
    // reproduz como o Google devolveria os itens que vieram dele
    const events: GcalEvent[] = s.items.filter((i) => i.src === 'Google Agenda').map((i, n) => ev({ id: `gcal-s${n}`, title: i.title, date: i.date, time: i.time, end: i.end, description: '', link: i.link, allDay: !i.time }));
    const r = mergeCalendar(s, events, WIN, TODAY, NOW);
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.state.items.length).toBe(s.items.length);
  });
});
