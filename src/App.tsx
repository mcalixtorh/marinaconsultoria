import type { ComponentType } from 'react';
import { hasSupabase } from './integrations/config';
import { NotifyProvider, useNotify } from './notify';
import { StoreProvider, useStore } from './store';
import { UiProvider, useUi, type TabId } from './ui';
import { Editor } from './components/Editor';
import { Icon } from './components/Icon';
import { Settings } from './components/Settings';
import { Agenda } from './screens/Agenda';
import { Alarmes } from './screens/Alarmes';
import { Busca } from './screens/Busca';
import { Categorias } from './screens/Categorias';
import { MeuDia } from './screens/MeuDia';
import { Notas } from './screens/Notas';
import { Painel } from './screens/Painel';
import { Rotinas } from './screens/Rotinas';
import { Tarefas } from './screens/Tarefas';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dia', label: 'Meu dia', icon: 'sun' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'tarefas', label: 'Tarefas', icon: 'list' },
  { id: 'rotinas', label: 'Rotinas', icon: 'routine' },
  { id: 'alarmes', label: 'Alarmes', icon: 'bell' },
  { id: 'notas', label: 'Anotações', icon: 'note' },
  { id: 'busca', label: 'Busca', icon: 'search' },
  { id: 'painel', label: 'Painel', icon: 'chart' },
  { id: 'categorias', label: 'Categorias', icon: 'tag' },
];

const SCREENS: Record<TabId, ComponentType> = {
  dia: MeuDia,
  agenda: Agenda,
  tarefas: Tarefas,
  rotinas: Rotinas,
  alarmes: Alarmes,
  notas: Notas,
  busca: Busca,
  painel: Painel,
  categorias: Categorias,
};

function Shell() {
  const { tab, setTab, openEditor, setSettingsOpen } = useUi();
  const { saveStatus, today } = useStore();
  const Screen = SCREENS[tab];
  const saveText = { salvo: 'Salvo neste aparelho', salvando: 'Salvando…', erro: 'Não consegui salvar neste aparelho' }[saveStatus];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <div className="brandrow">
            <div className="brand">
              Central de Rotina
              <small>Marina Calixto · Inspiração RH</small>
            </div>
            <button type="button" className="btn primary" onClick={() => openEditor({ item: null, defaults: { date: today } })}>
              <Icon name="plus" size={18} /> Nova tarefa
            </button>
          </div>
          <nav className="tabs" aria-label="Seções">
            {TABS.map((t) => (
              <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} size={18} /> {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="main">
        <Screen />
      </main>
      <footer className="footer">
        <span role="status">
          <i className={`dot${saveStatus === 'erro' ? ' err' : saveStatus === 'salvando' ? ' warn' : ''}`} />
          {saveText} · nuvem: {hasSupabase ? 'configurada (veja Ajustes)' : 'desligada'}
        </span>
        <button type="button" className="btn small ghost" onClick={() => setSettingsOpen(true)}>
          <Icon name="gear" size={16} /> Ajustes e backup
        </button>
      </footer>
      <Editor />
      <Settings />
      <RingScreen />
    </div>
  );
}

function RingScreen() {
  const { ringing, stop, snooze } = useNotify();
  if (!ringing) return null;
  return (
    <div className="ring" role="alertdialog" aria-modal="true" aria-label={`Alarme: ${ringing.title}`}>
      <div>
        <div className="pulse" style={{ display: 'inline-block' }}><Icon name="bell" size={64} /></div>
        <p style={{ margin: 0, opacity: 0.9 }}>{ringing.body}</p>
        <h1>{ringing.title}</h1>
        <div className="ring-actions">
          <button type="button" className="btn" autoFocus onClick={stop}>Parar</button>
          {ringing.refId && <button type="button" className="btn ghost" style={{ color: '#fff' }} onClick={snooze}>Soneca 5 min</button>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <NotifyProvider>
        <UiProvider>
          <Shell />
        </UiProvider>
      </NotifyProvider>
    </StoreProvider>
  );
}
