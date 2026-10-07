import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Exclusão em dois passos: "Excluir" → "Confirmar exclusão". Sem window.confirm. */
export function DeleteButton({ onConfirm, label = 'Excluir', small = true }: { onConfirm: () => void; label?: string; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) {
    return (
      <button type="button" className={`btn${small ? ' small' : ''}`} onClick={() => setArmed(true)}>
        <Icon name="trash" size={16} /> {label}
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className={`btn danger${small ? ' small' : ''}`} onClick={onConfirm}>
        Confirmar exclusão
      </button>
      <button type="button" className={`btn${small ? ' small' : ''}`} onClick={() => setArmed(false)}>
        Cancelar
      </button>
    </span>
  );
}

export function Progress({ done, total, sage = false }: { done: number; total: number; sage?: boolean }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={`progress${sage ? ' sage' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% concluído`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100));

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CheckButton({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className="check" role="checkbox" aria-checked={checked} aria-label={label} onClick={onClick}>
      <span>{checked && <Icon name="check" size={16} />}</span>
    </button>
  );
}

export function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <span className="switchwrap">
      <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onClick} />
    </span>
  );
}
