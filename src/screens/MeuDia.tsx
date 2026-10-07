import { useStore } from '../store';
import { useUi } from '../ui';
import { greeting, longDate } from '../lib/dates';
import { occurrencesOn, overdueOccurrences, toOrganize, upcoming } from '../lib/tasks';
import { relativeDay } from '../lib/dates';
import { CheckButton, Progress, pct } from '../components/common';
import { Icon } from '../components/Icon';
import { ItemList, ItemRow } from '../components/ItemRow';
import { AssistantBar } from '../components/AssistantBar';

export function MeuDia() {
  const { state, dispatch, now, today, nowMin } = useStore();
  const { setTab, openEditor } = useUi();

  const todayOcc = occurrencesOn(state.items, today);
  const timed = todayOcc.filter((o) => o.item.time);
  const untimed = todayOcc.filter((o) => !o.item.time);
  const countable = todayOcc.filter((o) => o.item.kind !== 'lembrete');
  const done = countable.filter((o) => o.done).length;
  const overdue = overdueOccurrences(state.items, today, nowMin);
  const next = upcoming(state.items, today, nowMin, 6, 14);
  const organize = toOrganize(state.items);
  const prios = state.priorities[today] ?? [0, 1, 2].map(() => ({ text: '', done: false }));

  return (
    <div className="stack">
      <div className="hello">
        <h1>{greeting(now.getHours())}, Marina!</h1>
        <p>{longDate(today)}</p>
      </div>

      <AssistantBar />

      {state.missed.length > 0 && (
        <section className="card warn" aria-label="Avisos que passaram">
          <div className="card-head">
            <span className="eyebrow">Avisos que passaram</span>
            <button type="button" className="btn small" onClick={() => dispatch({ type: 'notify/dismiss' })}>Ok, vi todos</button>
          </div>
          <div className="rows">
            {state.missed.map((m) => (
              <div key={m.key} className="row" style={{ padding: '8px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="row-title">{m.title}</div>
                  <div className="row-meta">{m.body}</div>
                </div>
                <button type="button" className="btn small" onClick={() => dispatch({ type: 'notify/dismiss', key: m.key })}>Ok, vi</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="cols">
        <div className="stack">
          <section className="card blush" aria-label="Progresso do dia">
            <div className="bigline">
              Rotina de hoje: <b>{done} de {countable.length}</b> concluídas — {pct(done, countable.length)}%
            </div>
            <Progress done={done} total={countable.length} />
          </section>

          <section className="card" aria-label="3 prioridades de hoje">
            <div className="card-head"><h2>3 prioridades de hoje</h2></div>
            {prios.map((p, i) => (
              <div key={i} className="step">
                <CheckButton checked={p.done} label={`Prioridade ${i + 1} concluída`} onClick={() => dispatch({ type: 'priority/set', date: today, index: i, patch: { done: !p.done } })} />
                <input
                  className="input"
                  style={{ margin: '4px 0', textDecoration: p.done ? 'line-through' : 'none' }}
                  value={p.text}
                  placeholder={`Prioridade ${i + 1}`}
                  aria-label={`Prioridade ${i + 1}`}
                  onChange={(e) => dispatch({ type: 'priority/set', date: today, index: i, patch: { text: e.target.value } })}
                />
              </div>
            ))}
          </section>

          {overdue.length > 0 && (
            <section className="card warn" aria-label="Atrasados">
              <div className="card-head">
                <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={16} /> Atrasados ({overdue.length})</span>
              </div>
              <div className="rows">
                {overdue.map((o) => <ItemRow key={`${o.item.id}|${o.date}`} item={o.item} date={o.date} showDate />)}
              </div>
            </section>
          )}

          <section className="card" aria-label="Hoje">
            <div className="card-head"><h2>Hoje</h2></div>
            <ItemList empty="Nada com horário marcado para hoje.">
              {timed.map((o) => <ItemRow key={o.item.id} item={o.item} date={o.date} />)}
            </ItemList>
          </section>

          <section className="card" aria-label="Tarefas de hoje">
            <div className="card-head">
              <h2>Tarefas de hoje</h2>
              <button type="button" className="btn small" onClick={() => openEditor({ item: null, defaults: { date: today } })}><Icon name="plus" size={16} /> Adicionar</button>
            </div>
            <ItemList empty="Nenhuma tarefa sem horário para hoje.">
              {untimed.map((o) => <ItemRow key={o.item.id} item={o.item} date={o.date} />)}
            </ItemList>
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-label="Próximos compromissos">
            <div className="card-head"><h2>Próximos</h2></div>
            <ItemList empty="Nenhum compromisso com horário nos próximos 14 dias.">
              {next.map((o) => (
                <div key={`${o.item.id}|${o.date}`} className="row" style={{ padding: '10px 0' }}>
                  <span className="time">{relativeDay(o.date, today)} · {o.item.time}</span> — {o.item.title}
                </div>
              ))}
            </ItemList>
          </section>

          <section className="card" aria-label="Rotinas de hoje">
            <div className="card-head">
              <h2>Rotinas</h2>
              <button type="button" className="btn small ghost" onClick={() => setTab('rotinas')}>Abrir</button>
            </div>
            {state.routines.length === 0 && <div className="empty">Nenhuma rotina criada.</div>}
            {state.routines.map((r) => {
              const d = (r.done[today] ?? []).filter((id) => r.steps.some((s) => s.id === id)).length;
              return (
                <div key={r.id} style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span className="row-title">{r.name}</span>
                    <span className="muted small">{d}/{r.steps.length}</span>
                  </div>
                  <Progress done={d} total={r.steps.length} sage />
                </div>
              );
            })}
          </section>

          <section className="card" aria-label="A organizar">
            <div className="card-head">
              <h2>A organizar</h2>
              <span className="tag">{organize.length}</span>
            </div>
            <p className="small muted" style={{ margin: '0 0 6px' }}>Itens sem data: nada foi assumido por mim.</p>
            <ItemList empty="Tudo organizado.">
              {organize.slice(0, 3).map((i) => <ItemRow key={i.id} item={i} date="" />)}
            </ItemList>
            {organize.length > 3 && (
              <button type="button" className="btn small ghost" onClick={() => setTab('tarefas')}>Ver todos ({organize.length})</button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
