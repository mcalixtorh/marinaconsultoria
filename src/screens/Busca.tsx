import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { search } from '../lib/search';
import { nextOccurrence, isRecurring } from '../lib/recurrence';
import { ItemRow } from '../components/ItemRow';
import { Icon } from '../components/Icon';

export function Busca() {
  const { state, today } = useStore();
  const { setTab } = useUi();
  const [q, setQ] = useState('');
  const res = useMemo(() => search(state, q), [state, q]);
  const total = res.items.length + res.routines.length + res.notes.length;
  const searching = q.trim().length > 0;

  return (
    <div className="stack">
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="q" className="sr">Pesquisar</label>
        <input id="q" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Pesquisar "Gabriella", cliente, vaga…' autoFocus enterKeyHint="search" />
      </div>
      {!searching && <div className="card empty">Pesquise em tarefas, compromissos, clientes, rotinas e anotações. Acentos e maiúsculas não importam.</div>}
      {searching && total === 0 && <div className="card empty">Nada encontrado para "{q.trim()}".</div>}

      {res.items.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Tarefas e compromissos ({res.items.length})</h2></div>
          <div className="rows">
            {res.items.map((i) => (
              <ItemRow key={i.id} item={i} date={i.date && isRecurring(i) ? nextOccurrence(i, today) ?? i.date : i.date} showDate />
            ))}
          </div>
        </section>
      )}
      {res.routines.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Rotinas ({res.routines.length})</h2></div>
          {res.routines.map((r) => (
            <button key={r.id} type="button" className="btn ghost" onClick={() => setTab('rotinas')}><Icon name="routine" size={16} /> {r.name}</button>
          ))}
        </section>
      )}
      {res.notes.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Anotações ({res.notes.length})</h2></div>
          {res.notes.map((n) => (
            <button key={n.id} type="button" className="row-body" style={{ display: 'block', width: '100%', whiteSpace: 'pre-wrap' }} onClick={() => setTab('notas')}>
              {n.text.length > 220 ? `${n.text.slice(0, 220)}…` : n.text}
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
