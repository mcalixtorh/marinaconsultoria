import { useState } from 'react';
import { useStore } from '../store';
import { Icon } from '../components/Icon';
import { DeleteButton } from '../components/common';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function Categorias() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<'trabalho' | 'pessoal'>('trabalho');
  const [error, setError] = useState('');
  const use = (id: string) => state.items.filter((i) => i.cat === id).length;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (state.categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) return setError('Já existe uma categoria com esse nome.');
    const id = `${slug(n) || 'cat'}-${Date.now().toString(36)}`;
    dispatch({ type: 'category/add', category: { id, name: n, group, color: group === 'trabalho' ? '#C25259' : '#8A7566' } });
    setName('');
    setError('');
  };

  return (
    <div className="stack">
      <div className="cols">
        {(['trabalho', 'pessoal'] as const).map((g) => (
          <section key={g} className="card">
            <div className="card-head"><h2>{g === 'trabalho' ? 'Trabalho' : 'Pessoal'}</h2></div>
            {state.categories.filter((c) => c.group === g).map((c) => (
              <div key={c.id} className="alarm" style={{ padding: '4px 0' }}>
                <span className="alarm-info">{c.name} <span className="small muted">· {use(c.id)} {use(c.id) === 1 ? 'item' : 'itens'}</span></span>
                {use(c.id) === 0 ? (
                  <DeleteButton onConfirm={() => dispatch({ type: 'category/delete', id: c.id })} />
                ) : (
                  <span className="small muted" title="Mude os itens de categoria antes de excluir">em uso</span>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      <form className="card" onSubmit={add}>
        <h2 style={{ marginBottom: 10 }}>Nova categoria</h2>
        <div className="grid2">
          <div className="field">
            <label htmlFor="c-name">Nome</label>
            <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Estudos" />
          </div>
          <div className="field">
            <label htmlFor="c-group">Grupo</label>
            <select id="c-group" className="select" value={group} onChange={(e) => setGroup(e.target.value as 'trabalho' | 'pessoal')}>
              <option value="trabalho">Trabalho</option>
              <option value="pessoal">Pessoal</option>
            </select>
          </div>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn primary" disabled={!name.trim()}><Icon name="plus" size={16} /> Adicionar categoria</button>
      </form>
    </div>
  );
}
