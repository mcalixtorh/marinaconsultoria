import { useMemo, useState } from 'react';
import type { Item, Prio } from '../types';
import { useStore } from '../store';
import { useUi } from '../ui';
import { isRecurring, nextOccurrence } from '../lib/recurrence';
import { displayStatus, overdueOccurrences } from '../lib/tasks';
import { Icon } from '../components/Icon';
import { ItemList, ItemRow } from '../components/ItemRow';

type Filter = 'todas' | 'pendente' | 'andamento' | 'concluido' | 'atrasado' | 'organizar';
const FILTERS: [Filter, string][] = [
  ['todas', 'Todas'],
  ['pendente', 'Pendentes'],
  ['andamento', 'Em andamento'],
  ['concluido', 'Concluídas'],
  ['atrasado', 'Atrasadas'],
  ['organizar', 'A organizar'],
];

/** Data que representa o item na lista: a ocorrência atrasada, a próxima ou a própria data. */
function repDate(item: Item, overdueDate: string | undefined, today: string): string {
  if (!item.date) return '';
  if (!isRecurring(item)) return item.date;
  return overdueDate ?? nextOccurrence(item, today) ?? item.date;
}

export function Tarefas() {
  const { state, today, nowMin } = useStore();
  const { openEditor } = useUi();
  const [filter, setFilter] = useState<Filter>('todas');
  const [prio, setPrio] = useState<'' | Prio>('');
  const [cat, setCat] = useState('');

  const rows = useMemo(() => {
    const late = new Map(overdueOccurrences(state.items, today, nowMin).map((o) => [o.item.id, o.date]));
    return state.items
      .map((item) => {
        const date = repDate(item, late.get(item.id), today);
        const st = date ? displayStatus(item, date, today, nowMin) : item.status;
        return { item, date, st };
      })
      .filter(({ item, date, st }) => {
        if (prio && item.prio !== prio) return false;
        if (cat && item.cat !== cat) return false;
        switch (filter) {
          case 'pendente': return st === 'pendente';
          case 'andamento': return st === 'andamento';
          case 'concluido': return st === 'concluido';
          case 'atrasado': return st === 'atrasado';
          case 'organizar': return !date && st !== 'concluido';
          default: return true;
        }
      })
      .sort((a, b) => {
        if (!a.date !== !b.date) return a.date ? -1 : 1;
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.item.time || '99') < (b.item.time || '99') ? -1 : 1;
      });
  }, [state.items, today, nowMin, filter, prio, cat]);

  return (
    <div className="stack">
      <div className="chips scroll" role="group" aria-label="Situação">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="grid2">
        <select className="select" aria-label="Filtrar por prioridade" value={prio} onChange={(e) => setPrio(e.target.value as '' | Prio)}>
          <option value="">Toda prioridade</option>
          <option value="urgente">Urgente</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
        <select className="select" aria-label="Filtrar por categoria" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Toda categoria</option>
          {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <section className="card">
        <div className="card-head">
          <h2>{rows.length} {rows.length === 1 ? 'item' : 'itens'}</h2>
          <button type="button" className="btn primary small" onClick={() => openEditor({ item: null, defaults: filter === 'organizar' ? { date: '' } : {} })}>
            <Icon name="plus" size={16} /> Nova
          </button>
        </div>
        <ItemList empty="Nada por aqui com esses filtros.">
          {rows.map(({ item, date }) => <ItemRow key={item.id} item={item} date={date} showDate />)}
        </ItemList>
      </section>
    </div>
  );
}
