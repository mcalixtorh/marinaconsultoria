import { useState } from 'react';
import type { Item } from '../types';
import { useCategoryName, useStore } from '../store';
import { useUi } from '../ui';
import { addDays, relativeDay } from '../lib/dates';
import { describeRecur, isRecurring } from '../lib/recurrence';
import { displayStatus } from '../lib/tasks';
import { CheckButton, DeleteButton } from './common';
import { Icon } from './Icon';

const PRIO_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' } as const;
const KIND_LABEL = { tarefa: 'Tarefa', compromisso: 'Compromisso', lembrete: 'Lembrete' } as const;

interface Props {
  item: Item;
  /** data da ocorrência exibida */
  date: string;
  /** mostra "Hoje/Amanhã/qua, 07/10" na linha */
  showDate?: boolean;
}

export function ItemRow({ item, date, showDate = false }: Props) {
  const { dispatch, today, nowMin } = useStore();
  const { openEditor } = useUi();
  const catName = useCategoryName();
  const [open, setOpen] = useState(false);
  const status = displayStatus(item, date, today, nowMin);
  const done = status === 'concluido';
  const recurring = isRecurring(item);
  const reschedule = (d: string) => {
    dispatch({ type: 'item/reschedule', id: item.id, date: d });
    setOpen(false);
  };

  return (
    <div className={`row${done ? ' done' : ''}`}>
      <div className="row-main">
        <CheckButton checked={done} label={done ? `Reabrir: ${item.title}` : `Concluir: ${item.title}`} onClick={() => dispatch({ type: 'item/toggle', id: item.id, date })} />
        <button type="button" className="row-body" aria-expanded={open} onClick={() => setOpen(!open)}>
          <div className="row-title">{item.title}</div>
          <div className="row-meta">
            {showDate && date && <span>{relativeDay(date, today)}</span>}
            {item.time && <span className="time">{item.time}</span>}
            {item.kind !== 'tarefa' && <span>{KIND_LABEL[item.kind]}</span>}
            <span>{catName(item.cat)}</span>
            {item.person && <span>{item.person}</span>}
            {status === 'atrasado' && <span className="tag late">Atrasado</span>}
            {status === 'andamento' && <span className="tag doing">Em andamento</span>}
            {item.prio === 'urgente' && <span className="tag urgente">Urgente</span>}
            {item.prio === 'alta' && <span className="tag alta">Alta</span>}
            {recurring && (
              <span title={describeRecur(item.recur)} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Icon name="repeat" size={14} /> {describeRecur(item.recur)}
              </span>
            )}
          </div>
        </button>
      </div>
      {open && (
        <>
          {item.desc && (
            <div className="row-desc">{item.desc}</div>
          )}
          <div className="row-actions">
            <button type="button" className="btn small" onClick={() => openEditor({ item })}>
              <Icon name="edit" size={16} /> Editar
            </button>
            {item.link && (
              <a className="btn small" href={item.link} target="_blank" rel="noreferrer">
                <Icon name="video" size={16} /> Abrir reunião
              </a>
            )}
            {!recurring && !done && (
              <button type="button" className="btn small" onClick={() => dispatch({ type: 'item/status', id: item.id, status: item.status === 'andamento' ? 'pendente' : 'andamento' })}>
                {item.status === 'andamento' ? 'Voltar a pendente' : 'Marcar em andamento'}
              </button>
            )}
            {!recurring && (
              <>
                <button type="button" className="btn small" onClick={() => reschedule(today)}>Reagendar: hoje</button>
                <button type="button" className="btn small" onClick={() => reschedule(addDays(today, 1))}>Amanhã</button>
                <button type="button" className="btn small" onClick={() => reschedule(addDays(today, 7))}>Em 7 dias</button>
              </>
            )}
            <DeleteButton onConfirm={() => dispatch({ type: 'item/delete', id: item.id })} />
          </div>
          <div className="row-desc" style={{ paddingTop: 0 }}>
            <span className="small">Prioridade {PRIO_LABEL[item.prio]}{item.src ? ` · origem: ${item.src}` : ''}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function ItemList({ children, empty }: { children: React.ReactNode[] | React.ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children];
  return arr.length === 0 ? <div className="empty">{empty}</div> : <div className="rows">{children}</div>;
}
