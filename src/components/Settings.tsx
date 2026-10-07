import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { describeNotifyStatus, useNotify } from '../notify';
import { exportBackup, parseBackup } from '../lib/storage';
import { useGcal } from '../integrations/gcalSync';
import { readPass, savePass } from '../integrations/passcode';
import { cloudGet, cloudPut, disablePush, enablePush, pushStatus, sendTest } from '../integrations/push';
import { usePushSync } from '../integrations/pushSync';
import { Sheet } from './common';
import type { AppState } from '../types';

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

      <PushBlock />
      <CloudBlock />

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

function PushBlock() {
  const { info } = useNotify();
  const { subscribed, refresh, lastError } = usePushSync();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [stat, setStat] = useState<{ devices: number; pending: number } | null>(null);
  useEffect(() => {
    void pushStatus().then(setStat);
  }, [subscribed, busy]);

  const act = async (fn: () => Promise<string | null>, ok: string) => {
    setBusy(true);
    setMsg('');
    try {
      const err = await fn();
      await refresh();
      setMsg(err ?? ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Algo deu errado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>Avisos com o app fechado</h3>
      <p className="small muted">
        Um servidor confere o relógio e manda uma <strong>notificação</strong> para este aparelho na hora do lembrete, mesmo com a tela bloqueada. É uma notificação normal (som padrão, uma vez), não um despertador: para acordar, use o app Relógio.
      </p>
      {info.iosNeedsInstall && <div className="note-box"><strong>Instale o app primeiro.</strong> No iPhone, toque em Compartilhar › Adicionar à Tela de Início e abra por esse ícone.</div>}
      {subscribed ? (
        <div className="note-box ok"><strong>Ativado neste aparelho.</strong>{stat ? ` ${stat.devices} aparelho(s) cadastrado(s), ${stat.pending} aviso(s) agendado(s).` : ''}</div>
      ) : (
        !info.iosNeedsInstall && <div className="note-box"><strong>Desativado neste aparelho.</strong> Toque em ativar e permita as notificações.</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {!subscribed ? (
          <button type="button" className="btn primary small" disabled={busy || info.iosNeedsInstall} onClick={() => void act(enablePush, 'Ativado. Toque em "Enviar notificação de teste".')}>Ativar avisos com o app fechado</button>
        ) : (
          <>
            <button type="button" className="btn small" disabled={busy} onClick={() => void act(async () => { const m = await sendTest(); return m; }, '')}>Enviar notificação de teste</button>
            <button type="button" className="btn small" disabled={busy} onClick={() => void act(disablePush, 'Desativado neste aparelho.')}>Desativar</button>
          </>
        )}
      </div>
      {lastError && <p className="err" role="alert">{lastError}</p>}
      {msg && <p role="status" className="small"><strong>{msg}</strong></p>}
    </section>
  );
}

function CloudBlock() {
  const { state, dispatch } = useStore();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<AppState | null>(null);
  const when = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <section className="card">
      <h3>Cópia na nuvem (celular e computador)</h3>
      <p className="small muted">Guarda uma cópia dos seus dados no servidor para você abrir o mesmo conteúdo em outro aparelho. É manual e a última cópia enviada vale: enviar substitui a da nuvem; trazer substitui a deste aparelho.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn small" disabled={busy} onClick={async () => {
          setBusy(true); setConfirm(null);
          try { setMsg((await cloudPut(state)) ?? 'Enviado para a nuvem.'); } catch { setMsg('Sem conexão.'); } finally { setBusy(false); }
        }}>Enviar este aparelho para a nuvem</button>
        <button type="button" className="btn small" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await cloudGet();
            if (r.error) setMsg(r.error);
            else if (!r.state) setMsg('Ainda não há cópia na nuvem.');
            else { setConfirm(r.state); setMsg(''); }
          } catch { setMsg('Sem conexão.'); } finally { setBusy(false); }
        }}>Trazer da nuvem</button>
      </div>
      {confirm && (
        <div className="note-box" style={{ marginTop: 10 }}>
          <strong>Substituir os dados deste aparelho?</strong>
          <div>A cópia da nuvem é de {when(confirm.updatedAt)} e tem {confirm.items.length} itens. Os dados daqui serão trocados.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn danger small" onClick={() => { dispatch({ type: 'state/replace', state: { ...confirm, lastCheck: Date.now() } }); setConfirm(null); setMsg('Dados da nuvem carregados.'); }}>Confirmar</button>
            <button type="button" className="btn small" onClick={() => setConfirm(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="small"><strong>{msg}</strong></p>}
    </section>
  );
}
