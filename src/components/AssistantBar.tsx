import { useRef, useState } from 'react';
import { useStore } from '../store';
import { applyPlan, buildContext, planActions, type Plan } from '../assistant/actions';
import type { AppState } from '../types';
import { Icon } from './Icon';
import { readPass, savePass } from '../integrations/passcode';

type Result =
  | { kind: 'info'; message: string; problems: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'confirm'; message: string; plan: Plan }
  | { kind: 'done'; message: string; lines: string[]; warnings: string[]; problems: string[]; undo: { snapshot: AppState; updatedAt: number } };

export function AssistantBar() {
  const { state, dispatch, today } = useStore();
  const latest = useRef(state);
  latest.current = state;
  const [text, setText] = useState('');
  const [pass, setPass] = useState(readPass);
  const [passInput, setPassInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  /** Aplica o plano em cima do estado MAIS RECENTE (o pedido à IA leva alguns segundos). */
  const run = (plan: Plan, message: string) => {
    const current = latest.current;
    const fresh = planActions(current, plan.actions, today); // revalida contra o que existe agora
    if (fresh.actions.length === 0) {
      setResult({ kind: 'info', message: message || 'Nada para fazer.', problems: fresh.problems });
      return;
    }
    const next = applyPlan(current, fresh);
    dispatch({ type: 'state/replace', state: next });
    setResult({ kind: 'done', message, lines: fresh.lines, warnings: fresh.warnings, problems: fresh.problems, undo: { snapshot: current, updatedAt: next.updatedAt } });
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const command = text.trim();
    if (!command || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-passcode': pass },
        body: JSON.stringify({ command, context: buildContext(latest.current, new Date()) }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; actions?: unknown[]; error?: string; code?: string };
      if (res.status === 404) return setResult({ kind: 'error', message: 'O assistente só funciona no app publicado (Vercel), não no modo de desenvolvimento.' });
      if (res.status === 401) {
        savePass('');
        setPass('');
        return setResult({ kind: 'error', message: 'Senha do assistente incorreta. Digite de novo.' });
      }
      if (!res.ok) return setResult({ kind: 'error', message: data.error ?? 'Não consegui falar com o assistente agora.' });

      const plan = planActions(latest.current, data.actions ?? [], today);
      const message = (data.message ?? '').trim();
      setText('');
      if (plan.actions.length === 0) return setResult({ kind: 'info', message: message || 'Não entendi o que fazer com isso.', problems: plan.problems });
      if (plan.destructive) return setResult({ kind: 'confirm', message, plan });
      run(plan, message);
    } catch {
      setResult({ kind: 'error', message: 'Sem conexão com o assistente. Confira a internet.' });
    } finally {
      setBusy(false);
    }
  };

  const canUndo = result?.kind === 'done' && state.updatedAt === result.undo.updatedAt;
  const undo = () => {
    if (result?.kind !== 'done') return;
    const cur = latest.current;
    // volta ao que era antes, mas não mexe no controle de avisos
    dispatch({ type: 'state/replace', state: { ...result.undo.snapshot, lastCheck: cur.lastCheck, missed: cur.missed, snoozes: cur.snoozes } });
    setResult({ kind: 'info', message: 'Desfeito.', problems: [] });
  };

  return (
    <section className="card blush" aria-label="Assistente">
      <div className="card-head"><h2>Assistente</h2></div>
      {!pass && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = passInput.trim();
            if (!v) return;
            savePass(v);
            setPass(v);
            setPassInput('');
          }}
        >
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="as-pass">Senha do assistente (só na primeira vez neste aparelho)</label>
            <input id="as-pass" type="password" className="input" autoComplete="off" value={passInput} onChange={(e) => setPassInput(e.target.value)} />
          </div>
          <button type="submit" className="btn small" disabled={!passInput.trim()}>Salvar senha</button>
        </form>
      )}
      <form onSubmit={send} style={{ marginTop: pass ? 0 : 12 }}>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="as-text" className="sr">Peça algo ao assistente</label>
          <input
            id="as-text"
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: cancelar a entrevista da Beatriz"
            enterKeyHint="send"
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <button type="submit" className="btn primary" disabled={!text.trim() || busy || !pass}>
          <Icon name="bell" size={16} /> {busy ? 'Pensando…' : 'Enviar'}
        </button>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Escreva ou fale (microfone do teclado). Ex.: "passa a reunião do Leonardo para amanhã às 15h", "o que tenho amanhã?", "anota: pedir currículo da Gabriella".
        </p>
      </form>

      <div role="status" aria-live="polite">
        {result?.kind === 'error' && <p className="err">{result.message}</p>}
        {result?.kind === 'info' && (
          <div className="note-box" style={{ marginTop: 10 }}>
            {result.message && <div style={{ whiteSpace: 'pre-wrap' }}>{result.message}</div>}
            {result.problems.map((p) => <div key={p}>{p}</div>)}
          </div>
        )}
        {result?.kind === 'confirm' && (
          <div className="note-box" style={{ marginTop: 10 }}>
            <strong>Confirma?</strong>
            {result.message && <div>{result.message}</div>}
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{result.plan.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            {result.plan.warnings.map((w) => <div key={w}><strong>Atenção:</strong> {w}</div>)}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="btn danger small" onClick={() => run(result.plan, result.message)}>Confirmar</button>
              <button type="button" className="btn small" onClick={() => setResult(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {result?.kind === 'done' && (
          <div className="note-box ok" style={{ marginTop: 10 }}>
            <strong>Feito.</strong>
            {result.message && <div>{result.message}</div>}
            <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{result.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            {result.warnings.map((w) => <div key={w}><strong>Atenção:</strong> {w}</div>)}
            {result.problems.map((p) => <div key={p}>{p}</div>)}
            {canUndo && <button type="button" className="btn small" onClick={undo}>Desfazer</button>}
          </div>
        )}
      </div>
    </section>
  );
}
