import { useState } from 'react';
import type { Routine } from '../types';
import { uid, useStore } from '../store';
import { CheckButton, DeleteButton, Progress } from '../components/common';
import { Icon } from '../components/Icon';

export function Rotinas() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  return (
    <div className="stack">
      <div className="cols">
        {state.routines.map((r) => <RoutineCard key={r.id} routine={r} />)}
      </div>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          dispatch({ type: 'routine/save', routine: { id: uid('r'), name: n, steps: [], done: {} } });
          setName('');
        }}
      >
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="r-new">Nova rotina</label>
          <input id="r-new" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Rotina da noite" />
        </div>
        <button type="submit" className="btn primary" disabled={!name.trim()}><Icon name="plus" size={16} /> Criar rotina</button>
      </form>
    </div>
  );
}

function RoutineCard({ routine }: { routine: Routine }) {
  const { dispatch, today } = useStore();
  const [editing, setEditing] = useState(false);
  const [newStep, setNewStep] = useState('');
  const doneIds = new Set(routine.done[today] ?? []);
  const done = routine.steps.filter((s) => doneIds.has(s.id)).length;
  const save = (r: Routine) => dispatch({ type: 'routine/save', routine: r });

  return (
    <section className="card">
      <div className="card-head">
        {editing ? (
          <input className="input" aria-label="Nome da rotina" value={routine.name} onChange={(e) => save({ ...routine, name: e.target.value })} />
        ) : (
          <h2>{routine.name}</h2>
        )}
        <button type="button" className="iconbtn" aria-label={editing ? 'Concluir edição' : 'Editar rotina'} onClick={() => setEditing(!editing)}>
          <Icon name={editing ? 'check' : 'edit'} />
        </button>
      </div>
      <div className="small muted">{done} de {routine.steps.length} etapas hoje</div>
      <Progress done={done} total={routine.steps.length} sage />

      <div style={{ marginTop: 8 }}>
        {routine.steps.length === 0 && <div className="empty">Sem etapas ainda. Toque no lápis para adicionar.</div>}
        {routine.steps.map((s) => (
          <div key={s.id} className={`step${doneIds.has(s.id) ? ' done' : ''}`}>
            <CheckButton checked={doneIds.has(s.id)} label={s.t} onClick={() => dispatch({ type: 'routine/step', routineId: routine.id, date: today, stepId: s.id })} />
            {editing ? (
              <input className="input" aria-label="Etapa" style={{ margin: '3px 0' }} value={s.t} onChange={(e) => save({ ...routine, steps: routine.steps.map((x) => (x.id === s.id ? { ...x, t: e.target.value } : x)) })} />
            ) : (
              <span className="label">{s.t}</span>
            )}
            {editing && (
              <button type="button" className="iconbtn" aria-label={`Remover etapa ${s.t}`} onClick={() => save({ ...routine, steps: routine.steps.filter((x) => x.id !== s.id) })}>
                <Icon name="close" />
              </button>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <form
          style={{ display: 'flex', gap: 8, marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            const t = newStep.trim();
            if (!t) return;
            save({ ...routine, steps: [...routine.steps, { id: uid('st'), t }] });
            setNewStep('');
          }}
        >
          <input className="input" aria-label="Nova etapa" placeholder="Nova etapa" value={newStep} onChange={(e) => setNewStep(e.target.value)} />
          <button type="submit" className="btn primary" disabled={!newStep.trim()}>Adicionar</button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" className="btn small" disabled={done === 0} onClick={() => dispatch({ type: 'routine/clear', routineId: routine.id, date: today })}>Desmarcar tudo de hoje</button>
        {editing && <DeleteButton onConfirm={() => dispatch({ type: 'routine/delete', id: routine.id })} label="Excluir rotina" />}
      </div>
    </section>
  );
}
