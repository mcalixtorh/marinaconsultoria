import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { describeNotifyStatus, useNotify } from '../notify';
import { exportBackup, parseBackup } from '../lib/storage';
import { hasGoogle, hasPush, hasSupabase } from '../integrations/config';
import { currentUserEmail, pullState, pushState, signInWithEmail, signOut, subscribePush } from '../integrations/supabase';
import { Sheet } from './common';

export function Settings() {
  const { settingsOpen, setSettingsOpen } = useUi();
  if (!settingsOpen) return null;
  return (
    <Sheet title="Ajustes" onClose={() => setSettingsOpen(false)}>
      <Body />
    </Sheet>
  );
}

function Body() {
  const { state, dispatch, saveStatus } = useStore();
  const { info } = useNotify();
  const notify = describeNotifyStatus(info);
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (hasSupabase) void currentUserEmail().then(setUser);
  }, []);

  const download = () => {
    const blob = new Blob([exportBackup(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `central-de-rotina-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const restore = async (f: File | undefined) => {
    if (!f) return;
    const r = parseBackup(await f.text());
    if (!r.ok) return setMsg(r.error);
    dispatch({ type: 'state/replace', state: r.state });
    setMsg('Backup restaurado.');
  };
  const run = async (fn: () => Promise<string | null | void>, ok: string) => {
    try {
      const err = await fn();
      setMsg(err ? String(err) : ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Algo deu errado.');
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>Seus dados</h3>
        <p className="small muted">
          {saveStatus === 'erro' ? 'O navegador não permitiu salvar neste aparelho. Exporte um backup agora.' : 'Tudo fica salvo neste aparelho. Exporte um backup de vez em quando para não perder nada se trocar de celular.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn small" onClick={download}>Exportar backup</button>
          <button type="button" className="btn small" onClick={() => file.current?.click()}>Restaurar backup</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </section>

      <section className="card">
        <h3>Notificações</h3>
        <div className={`note-box${notify.ok ? ' ok' : ''}`}><strong>{notify.label}</strong><div>{notify.hint}</div></div>
      </section>

      <section className="card">
        <h3>Sincronizar celular e computador</h3>
        {!hasSupabase ? (
          <div className="note-box"><strong>Não configurada.</strong> O app funciona sozinho neste aparelho. Para sincronizar é preciso criar o projeto Supabase (passo a passo no README).</div>
        ) : user ? (
          <>
            <p className="small">Conectada como <strong>{user}</strong>.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn small" onClick={() => run(async () => { await pushState(state); }, 'Enviado para a nuvem.')}>Enviar este aparelho para a nuvem</button>
              <button type="button" className="btn small" onClick={() => run(async () => {
                const remote = await pullState();
                if (!remote) return 'Ainda não há cópia na nuvem.';
                dispatch({ type: 'state/replace', state: remote.state });
              }, 'Dados da nuvem carregados.')}>Trazer da nuvem</button>
              <button type="button" className="btn small" onClick={() => { void signOut().then(() => setUser(null)); }}>Sair</button>
            </div>
            <p className="small muted">A sincronização é manual e a última cópia vence. Trazer da nuvem substitui os dados deste aparelho.</p>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void run(() => signInWithEmail(email.trim()), 'Enviei um link de acesso para o seu e-mail.'); }}>
            <div className="field"><label htmlFor="s-mail">Seu e-mail</label><input id="s-mail" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button type="submit" className="btn primary small" disabled={!email.trim()}>Receber link de acesso</button>
          </form>
        )}
      </section>

      <section className="card">
        <h3>Avisos com o app fechado (push)</h3>
        {hasPush && user ? (
          <button type="button" className="btn small" onClick={() => run(subscribePush, 'Este aparelho vai receber avisos mesmo com o app fechado.')}>Ativar push neste aparelho</button>
        ) : (
          <div className="note-box"><strong>Desligado.</strong> Precisa da sincronização acima e das chaves VAPID (README). Enquanto isso, os avisos funcionam com o app aberto ou em segundo plano.</div>
        )}
      </section>

      <section className="card">
        <h3>Google Agenda</h3>
        <div className="note-box">
          <strong>{hasGoogle ? 'ID de cliente encontrado, mas a conexão ainda não foi implementada.' : 'Não conectado.'}</strong>
          <div>Seus eventos já foram importados uma vez. A sincronização contínua precisa de OAuth do Google (README); a estrutura já está preparada.</div>
        </div>
      </section>
      {msg && <p role="status" className="small"><strong>{msg}</strong></p>}
    </div>
  );
}
