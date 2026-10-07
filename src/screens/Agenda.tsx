import { useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { addDays, addMonths, daysInMonth, longDate, monthName, parseISO, shortDate, startOfMonth, startOfWeek, toISO, weekday, weekdayName, weekdayShort } from '../lib/dates';
import { occurrencesOn } from '../lib/tasks';
import { Icon } from '../components/Icon';
import { ItemList, ItemRow } from '../components/ItemRow';

type Mode = 'hoje' | 'amanha' | 'semana' | 'mes';

export function Agenda() {
  const { state, today } = useStore();
  const { openEditor } = useUi();
  const [mode, setMode] = useState<Mode>('hoje');
  const [anchor, setAnchor] = useState(today);
  const [picked, setPicked] = useState(today);

  const choose = (m: Mode) => {
    setMode(m);
    if (m === 'hoje') setAnchor(today);
    if (m === 'amanha') setAnchor(addDays(today, 1));
    if (m === 'semana') setAnchor(today);
    if (m === 'mes') {
      setAnchor(today);
      setPicked(today);
    }
  };
  const step = (dir: 1 | -1) => {
    if (mode === 'hoje' || mode === 'amanha') setAnchor(addDays(anchor, dir));
    else if (mode === 'semana') setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(addMonths(startOfMonth(anchor), dir));
  };

  const title = (() => {
    if (mode === 'hoje' || mode === 'amanha') return anchor === today ? 'Hoje' : anchor === addDays(today, 1) ? 'Amanhã' : longDate(anchor);
    if (mode === 'semana') {
      const s = startOfWeek(anchor);
      return `${shortDate(s)} a ${shortDate(addDays(s, 6))}`;
    }
    const d = parseISO(anchor);
    return `${monthName(d.getMonth())[0].toUpperCase()}${monthName(d.getMonth()).slice(1)} de ${d.getFullYear()}`;
  })();

  const dayCard = (date: string) => {
    const occ = occurrencesOn(state.items, date);
    return (
      <section key={date} className={`card daycard${date === today ? ' today' : ''}`}>
        <div className="card-head">
          <h3>{weekdayName(weekday(date))}, {shortDate(date)}</h3>
          <button type="button" className="btn small" onClick={() => openEditor({ item: null, defaults: { date } })}><Icon name="plus" size={16} /> Adicionar neste dia</button>
        </div>
        <ItemList empty="Nada programado.">
          {occ.map((o) => <ItemRow key={o.item.id} item={o.item} date={o.date} />)}
        </ItemList>
      </section>
    );
  };

  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="Período">
        {([['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Semana'], ['mes', 'Mês']] as const).map(([m, label]) => (
          <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => choose(m)}>{label}</button>
        ))}
      </div>
      <div className="nav">
        <button type="button" className="iconbtn" aria-label="Anterior" onClick={() => step(-1)}><Icon name="left" /></button>
        <h2>{title}</h2>
        <button type="button" className="iconbtn" aria-label="Próximo" onClick={() => step(1)}><Icon name="right" /></button>
      </div>

      {(mode === 'hoje' || mode === 'amanha') && dayCard(anchor)}

      {mode === 'semana' && (
        <div className="stack">
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)).map(dayCard)}
        </div>
      )}

      {mode === 'mes' && (
        <>
          <MonthGrid anchor={anchor} picked={picked} onPick={setPicked} />
          {dayCard(picked)}
        </>
      )}
    </div>
  );
}

function MonthGrid({ anchor, picked, onPick }: { anchor: string; picked: string; onPick: (d: string) => void }) {
  const { state, today } = useStore();
  const first = startOfMonth(anchor);
  const lead = (weekday(first) + 6) % 7; // segunda = 0
  const total = daysInMonth(first);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => toISO(new Date(parseISO(first).getFullYear(), parseISO(first).getMonth(), i + 1)))];
  while (cells.length % 7) cells.push(null);
  return (
    <div className="card">
      <div className="month" role="grid" aria-label="Calendário do mês">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => <div key={d} className="mh">{weekdayShort(d)}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="day out" aria-hidden="true" />;
          const n = occurrencesOn(state.items, d).length;
          return (
            <button key={d} type="button" className={`day${d === today ? ' today' : ''}`} aria-pressed={d === picked} aria-label={`${d.slice(8)} — ${n} item(ns)`} onClick={() => onPick(d)}>
              <span>{Number(d.slice(8))}</span>
              {n > 0 && (
                <span className="pips">
                  <i className="pip" />
                  {n > 1 && n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
