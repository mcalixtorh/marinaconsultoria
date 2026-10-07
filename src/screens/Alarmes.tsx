import { useState } from 'react';
import type { Alarm } from '../types';
import { uid, useStore } from '../store';
import { describeNotifyStatus, useNotify } from '../notify';
import { weekdayShort } from '../lib/dates';
import { parseQuickAlarm, toAlarm } from '../lib/quickAlarm';
import { DeleteButton, Sheet, Switch } from '../components/common';
import { Icon } from '../components/Icon';

function daysLabel(a: Alarm): string {
  if (a.days.length === 0) return a.repeat ? 'Nunca' : 'Próxima vez';
  if (a.days.length === 7) return a.repeat ? 'Todos os dias' : 'Uma vez, qualquer dia';
  const names = [1, 2, 3, 4, 5, 6, 0].filter((d) => a.days.includes(d)).map(weekdayShort).join(', ');
  return a.repeat ? names : `Uma vez · ${names}`;
}

export function Alarmes() {
  const { state, dispatch } = useStore();
  const { info, askPermission, testAlarm } = useNotify();
  const [editing, setEditing] = useState<Alarm | null>(null);
  const [text, setText] = useState('');
  const [made, setMade] = useState<{ alarm: Alarm; summary: string; note?: string } | null>(null);
  const [quickError, setQuickError] = useState('');
  const status = describeNotifyStatus(info);
  const quickCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseQuickAlarm(text);
    if (!q) {
      setMade(null);
      return setQuickError('Não achei o horário. Escreva algo como "alarme 9h30 fazer café da manhã".');
    }
    const alarm = toAlarm(q, uid('a'));
    dispatch({ type: 'alarm/save', alarm });
    setMade({ alarm, summary: q.summary, note: q.note });
    setQuickError('');
    setText('');
  };
  const sorted = [...state.alarms].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><h2>Avisos neste aparelho</h2></div>
        <div className={`note-box${status.ok ? ' ok' : ''}`}>
          <strong>{status.label}</strong>
          <div>{status.hint}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {info.permission === 'default' && !info.iosNeedsInstall && (
            <button type="button" className="btn primary small" onClick={askPermission}>Permitir notificações</button>
          )}
          <button type="button" className="btn small" onClick={testAlarm}><Icon name="bell" size={16} /> Testar alarme</button>
        </div>
      </section>

      <form className="card blush" onSubmit={quickCreate}>
        <div className="card-head"><h2>Alarme rápido</h2></div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="q-alarm" className="sr">Escreva ou fale o alarme</label>
          <input
            id="q-alarm"
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='Ex.: alarme 9h30 fazer café da manhã'
            enterKeyHint="done"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="btn primary" disabled={!text.trim()}><Icon name="plus" size={16} /> Criar alarme</button>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Dá para falar: toque no microfone do teclado. Entende "nove e meia", "amanhã", "todo dia", "toda segunda", "dias úteis", "da tarde"…
        </p>
        {quickError && <p className="err" role="alert">{quickError}</p>}
        {made && (
          <div className="note-box ok" role="status" style={{ marginTop: 10 }}>
            <strong>Criei: {made.summary}</strong>
            {made.note && <div>{made.note}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="btn small" onClick={() => { dispatch({ type: 'alarm/delete', id: made.alarm.id }); setMade(null); }}>Desfazer</button>
              <button type="button" className="btn small" onClick={() => { setEditing(made.alarm); setMade(null); }}>Editar</button>
            </div>
          </div>
        )}
      </form>

      <section className="card">
        <div className="card-head">
          <h2>Alarmes</h2>
          <button type="button" className="btn primary small" onClick={() => setEditing({ id: uid('a'), time: '07:00', name: '', days: [1, 2, 3, 4, 5], repeat: true, enabled: true })}>
            <Icon name="plus" size={16} /> Novo alarme
          </button>
        </div>
        {sorted.length === 0 && <div className="empty">Nenhum alarme criado.</div>}
        {sorted.map((a) => (
          <div key={a.id} className={`alarm${a.enabled ? '' : ' off'}`}>
            <button type="button" className="row-body" style={{ flex: 1, padding: 0, display: 'flex', gap: 14, alignItems: 'center' }} onClick={() => setEditing(a)} aria-label={`Editar alarme ${a.name || a.time}`}>
              <span className="alarm-time">{a.time}</span>
              <span className="alarm-info">
                <div className="row-title">{a.name || 'Alarme'}</div>
                <div className="row-meta">{daysLabel(a)}</div>
              </span>
            </button>
            <Switch on={a.enabled} label={`Alarme ${a.name || a.time} ${a.enabled ? 'ativado' : 'desativado'}`} onClick={() => dispatch({ type: 'alarm/toggle', id: a.id })} />
          </div>
        ))}
      </section>

      {editing && <AlarmForm alarm={editing} isNew={!state.alarms.some((x) => x.id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AlarmForm({ alarm, isNew, onClose }: { alarm: Alarm; isNew: boolean; onClose: () => void }) {
  const { dispatch } = useStore();
  const [a, setA] = useState(alarm);
  const toggleDay = (d: number) => setA({ ...a, days: a.days.includes(d) ? a.days.filter((x) => x !== d) : [...a.days, d] });
  return (
    <Sheet title={isNew ? 'Novo alarme' : 'Editar alarme'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!a.time) return;
          dispatch({ type: 'alarm/save', alarm: { ...a, name: a.name.trim() } });
          onClose();
        }}
      >
        <div className="field">
          <label htmlFor="al-name">Nome</label>
          <input id="al-name" className="input" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Ex.: Acordar" />
        </div>
        <div className="field">
          <label htmlFor="al-time">Horário</label>
          <input id="al-time" type="time" required className="input" value={a.time} onChange={(e) => setA({ ...a, time: e.target.value })} />
        </div>
        <div className="field">
          <span className="lbl">Dias da semana</span>
          <div className="days">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} type="button" className="dbtn" aria-pressed={a.days.includes(d)} onClick={() => toggleDay(d)}>{weekdayShort(d)}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Repetição</span>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={a.repeat} onClick={() => setA({ ...a, repeat: true })}>Toda semana</button>
            <button type="button" className="chip" aria-pressed={!a.repeat} onClick={() => setA({ ...a, repeat: false })}>Uma vez</button>
          </div>
          <span className="small muted">"Uma vez" toca na próxima vez e desativa sozinho.</span>
        </div>
        <div className="sheet-foot">
          {!isNew && <DeleteButton small={false} onConfirm={() => { dispatch({ type: 'alarm/delete', id: a.id }); onClose(); }} />}
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary">Salvar</button>
        </div>
      </form>
    </Sheet>
  );
}
