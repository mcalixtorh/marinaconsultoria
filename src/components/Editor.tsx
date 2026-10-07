import { useState } from 'react';
import type { Item, Kind, Prio, RecurType, RecurUnit, Status } from '../types';
import { uid, useStore } from '../store';
import { useUi } from '../ui';
import { weekdayShort } from '../lib/dates';
import { NO_RECUR } from '../lib/recurrence';
import { REMINDER_OPTIONS } from '../lib/reminders';
import { DeleteButton, Sheet } from './common';

function blank(today: string, defaults?: Partial<Item>): Item {
  return {
    id: uid('t'),
    title: '',
    desc: '',
    kind: 'tarefa',
    date: today,
    time: '',
    end: '',
    cat: 'rs',
    prio: 'media',
    status: 'pendente',
    rem: [],
    recur: { ...NO_RECUR },
    doneDates: [],
    person: '',
    link: '',
    src: 'Criado no app',
    ...defaults,
  };
}

export function Editor() {
  const { editor, closeEditor } = useUi();
  if (!editor) return null;
  return <EditorForm key={editor.item?.id ?? 'novo'} onClose={closeEditor} />;
}

function EditorForm({ onClose }: { onClose: () => void }) {
  const { editor } = useUi();
  const { state, dispatch, today } = useStore();
  const existing = editor?.item ?? null;
  const [f, setF] = useState<Item>(() => existing ?? blank(today, editor?.defaults));
  const [error, setError] = useState('');
  const recurring = f.recur.type !== 'none';
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setF((p) => ({ ...p, [k]: v }));
  const setRecur = (patch: Partial<Item['recur']>) => setF((p) => ({ ...p, recur: { ...p.recur, ...patch } }));

  const toggleRem = (min: number) => set('rem', f.rem.includes(min) ? f.rem.filter((m) => m !== min) : [...f.rem, min].sort((a, b) => b - a));
  const toggleDay = (d: number) => setRecur({ weekdays: f.recur.weekdays.includes(d) ? f.recur.weekdays.filter((x) => x !== d) : [...f.recur.weekdays, d] });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) return setError('Dê um nome para continuar.');
    if (recurring && !f.date) return setError('Para repetir, escolha a data de início.');
    const item: Item = {
      ...f,
      title,
      desc: f.desc.trim(),
      person: (f.person ?? '').trim(),
      rem: f.time ? f.rem : [],
      // o status "concluído" de uma série é por dia; a série em si nunca fica concluída
      status: recurring && f.status === 'concluido' ? 'pendente' : f.status,
      recur: { ...f.recur, n: Math.max(1, Math.floor(f.recur.n) || 1) },
    };
    dispatch({ type: 'item/save', item });
    onClose();
  };

  const groups = [
    ['Trabalho', state.categories.filter((c) => c.group === 'trabalho')],
    ['Pessoal', state.categories.filter((c) => c.group === 'pessoal')],
  ] as const;

  return (
    <Sheet title={existing ? 'Editar' : 'Nova tarefa'} onClose={onClose}>
      <form onSubmit={save} noValidate>
        <div className="field">
          <label htmlFor="e-title">Título</label>
          <input id="e-title" className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Enviar retorno para candidata" autoFocus enterKeyHint="done" />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="e-date">Data</label>
            <input id="e-date" type="date" className="input" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="e-time">Horário</label>
            <input id="e-time" type="time" className="input" value={f.time} onChange={(e) => set('time', e.target.value)} />
          </div>
        </div>
        {!f.date && <div className="note-box" style={{ marginBottom: 14 }}>Sem data: o item vai para "A organizar".</div>}

        <div className="field">
          <span className="lbl">Lembretes</span>
          <div className="chips">
            {REMINDER_OPTIONS.map((o) => (
              <button key={o.min} type="button" className="chip" aria-pressed={f.rem.includes(o.min)} disabled={!f.time} onClick={() => toggleRem(o.min)}>
                {o.label}
              </button>
            ))}
          </div>
          {!f.time && <span className="small muted">Escolha um horário para ativar os lembretes.</span>}
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="e-kind">Tipo</label>
            <select id="e-kind" className="select" value={f.kind} onChange={(e) => set('kind', e.target.value as Kind)}>
              <option value="tarefa">Tarefa</option>
              <option value="compromisso">Compromisso</option>
              <option value="lembrete">Lembrete</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="e-prio">Prioridade</label>
            <select id="e-prio" className="select" value={f.prio} onChange={(e) => set('prio', e.target.value as Prio)}>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="e-cat">Categoria</label>
            <select id="e-cat" className="select" value={f.cat} onChange={(e) => set('cat', e.target.value)}>
              {groups.map(([name, list]) => (
                <optgroup key={name} label={name}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="e-status">Situação</label>
            <select id="e-status" className="select" value={f.status} onChange={(e) => set('status', e.target.value as Status)}>
              <option value="pendente">Pendente</option>
              <option value="andamento">Em andamento</option>
              {!recurring && <option value="concluido">Concluído</option>}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="e-rec">Repetição</label>
          <select id="e-rec" className="select" value={f.recur.type} onChange={(e) => setRecur({ type: e.target.value as RecurType })}>
            <option value="none">Não repete</option>
            <option value="daily">Todos os dias</option>
            <option value="weekly">Toda semana</option>
            <option value="monthly">Todo mês</option>
            <option value="month_first">Todo dia 1º do mês</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        {f.recur.type === 'weekly' && (
          <div className="field">
            <span className="lbl">Em quais dias? (ex.: só segunda-feira)</span>
            <div className="days">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button key={d} type="button" className="dbtn" aria-pressed={f.recur.weekdays.includes(d)} onClick={() => toggleDay(d)}>
                  {weekdayShort(d)}
                </button>
              ))}
            </div>
            <span className="small muted">Sem escolher, repete no mesmo dia da semana da data de início.</span>
          </div>
        )}
        {f.recur.type === 'custom' && (
          <div className="grid2">
            <div className="field">
              <label htmlFor="e-n">A cada</label>
              <input id="e-n" type="number" min={1} max={365} className="input" value={f.recur.n} onChange={(e) => setRecur({ n: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label htmlFor="e-u">Unidade</label>
              <select id="e-u" className="select" value={f.recur.unit} onChange={(e) => setRecur({ unit: e.target.value as RecurUnit })}>
                <option value="day">dia(s)</option>
                <option value="week">semana(s)</option>
                <option value="month">mês(es)</option>
              </select>
            </div>
          </div>
        )}
        {recurring && <div className="note-box" style={{ marginBottom: 14 }}>A série começa na data escolhida. Cada dia é concluído separadamente.</div>}

        <div className="field">
          <label htmlFor="e-person">Cliente ou candidata (opcional)</label>
          <input id="e-person" className="input" value={f.person ?? ''} onChange={(e) => set('person', e.target.value)} placeholder="Ex.: Gabriella" />
        </div>
        <div className="field">
          <label htmlFor="e-desc">Descrição</label>
          <textarea id="e-desc" className="textarea" value={f.desc} onChange={(e) => set('desc', e.target.value)} />
        </div>

        {error && <p className="err" role="alert">{error}</p>}
        <div className="sheet-foot">
          {existing && <DeleteButton small={false} onConfirm={() => { dispatch({ type: 'item/delete', id: existing.id }); onClose(); }} />}
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary">Salvar</button>
        </div>
      </form>
    </Sheet>
  );
}
