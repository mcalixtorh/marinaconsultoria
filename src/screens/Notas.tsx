import { uid, useStore } from '../store';
import { DeleteButton } from '../components/common';
import { Icon } from '../components/Icon';

export function Notas() {
  const { state, dispatch } = useStore();
  const notes = [...state.notes].sort((a, b) => b.at - a.at);
  return (
    <div className="stack">
      <div>
        <button type="button" className="btn primary" onClick={() => dispatch({ type: 'note/save', note: { id: uid('n'), at: Date.now(), text: '' } })}>
          <Icon name="plus" size={16} /> Nova anotação
        </button>
      </div>
      {notes.length === 0 && <div className="card empty">Nenhuma anotação. Use este espaço para o que você não pode esquecer.</div>}
      <div className="cols">
        {notes.map((n) => (
          <section key={n.id} className="card note">
            <div className="notehead">
              <span className="small muted">{new Date(n.at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} · salva ao digitar</span>
              <DeleteButton onConfirm={() => dispatch({ type: 'note/delete', id: n.id })} />
            </div>
            <textarea
              className="textarea"
              aria-label="Anotação"
              value={n.text}
              placeholder="Escreva aqui…"
              onChange={(e) => dispatch({ type: 'note/save', note: { ...n, text: e.target.value } })}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
