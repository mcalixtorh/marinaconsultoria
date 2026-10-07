import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { describeNotifyStatus, useNotify } from '../notify';
import { exportBackup, parseBackup } from '../lib/storage';
import { hasPush, hasSupabase } from '../integrations/config';
import { useGcal } from '../integrations/gcalSync';
import { readPass, savePass } from '../integrations/passcode';
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

      <GoogleBlock />
      {msg && <p role="status" className="small"><strong>{msg}</strong></p>}
    </div>
  );
}

function GoogleBlock() {
  const { status, syncNow } = useGcal();
  const { state } = useStore();
  const [pass, setPass] = useState('');
  const hasPass = Boolean(readPass());
  const last = status.last;
  const when = state.gcal?.lastSync ? new Date(state.gcal.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <section className="card">
      <h3>Google Agenda</h3>
      <p className="small muted">
        O app <strong>lê</strong> o seu Google Agenda pelo endereço secreto (só leitura) ao abrir e a cada 10 minutos. O que você muda aqui não vai para o Google. O Google manda no título, data e horário; o app guarda concluído, categoria, prioridade e lembretes.
      </p>
      {!hasPass || status.phase === 'needpass' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (pass.trim()) { savePass(pass.trim()); setPass(''); } }}>
          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="g-pass">Senha do assistente (a mesma da Vercel)</label>
            <input id="g-pass" type="password" className="input" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <button type="submit" className="btn small" disabled={!pass.trim()}>Salvar senha</button>
        </form>
      ) : null}
      {status.phase === 'ok' && (
        <div className="note-box ok">
          <strong>Lido{when ? ` em ${when}` : ''}.</strong> {last ? `${last.read} eventos no Google · ${last.added} novos, ${last.updated} atualizados, ${last.removed} removidos.` : ''}
          <div>Um evento novo pode demorar para aparecer: o Google atualiza esse link devagar, às vezes por várias horas.</div>
        </div>
      )}
      {status.phase === 'syncing' && <div className="note-box">Lendo o Google Agenda…</div>}
      {['error', 'off', 'dev'].includes(status.phase) && <div className="note-box"><strong>{status.phase === 'off' ? 'Não ativado.' : status.phase === 'dev' ? 'Indisponível aqui.' : 'Erro.'}</strong> {status.message}</div>}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn small" onClick={() => void syncNow()} disabled={status.phase === 'syncing'}>Atualizar agora</button>
      </div>
    </section>
  );
}
