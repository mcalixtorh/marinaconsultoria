import { useStore } from '../store';
import { useUi } from '../ui';
import { overdueOccurrences, statsBetween, toOrganize, weekRange, type Stats } from '../lib/tasks';

function StatRow({ s }: { s: Stats }) {
  return (
    <div className="stats">
      <div className="stat"><b>{s.total}</b><span>tarefas</span></div>
      <div className="stat good"><b>{s.done}</b><span>concluídas</span></div>
      <div className="stat"><b>{s.pending}</b><span>pendentes</span></div>
      <div className={`stat${s.overdue ? ' late' : ''}`}><b>{s.overdue}</b><span>atrasadas</span></div>
    </div>
  );
}

export function Painel() {
  const { state, today, nowMin } = useStore();
  const { setTab } = useUi();
  const day = statsBetween(state.items, today, today, today, nowMin);
  const [from, to] = weekRange(today);
  const week = statsBetween(state.items, from, to, today, nowMin);
  const lateTotal = overdueOccurrences(state.items, today, nowMin).length;
  const organize = toOrganize(state.items).length;

  return (
    <div className="cols">
      <div className="stack">
        <section className="card"><h2>Hoje</h2><StatRow s={day} /></section>
        <section className="card"><h2>Semana</h2><StatRow s={week} /></section>
      </div>
      <div className="stack">
        <section className="card">
          <h2>No total</h2>
          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className={`stat${lateTotal ? ' late' : ''}`}><b>{lateTotal}</b><span>atrasadas</span></div>
            <button type="button" className="stat" style={{ border: 0, font: 'inherit' }} onClick={() => setTab('tarefas')}><b>{organize}</b><span>a organizar</span></button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>Lembretes não entram na contagem de tarefas.</p>
        </section>
      </div>
    </div>
  );
}
