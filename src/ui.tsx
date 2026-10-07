import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Item } from './types';

export type TabId = 'dia' | 'agenda' | 'tarefas' | 'rotinas' | 'alarmes' | 'notas' | 'busca' | 'painel' | 'categorias';

export interface EditorRequest {
  /** item existente (edição) ou null (novo) */
  item: Item | null;
  /** valores iniciais de um item novo */
  defaults?: Partial<Item>;
}

interface UiCtx {
  tab: TabId;
  setTab: (t: TabId) => void;
  editor: EditorRequest | null;
  openEditor: (req: EditorRequest) => void;
  closeEditor: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

const Ctx = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<TabId>('dia');
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const setTab = useCallback((t: TabId) => {
    setTabState(t);
    window.scrollTo({ top: 0 });
  }, []);
  const value = useMemo<UiCtx>(
    () => ({ tab, setTab, editor, openEditor: setEditor, closeEditor: () => setEditor(null), settingsOpen, setSettingsOpen }),
    [tab, setTab, editor, settingsOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi(): UiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUi fora do UiProvider');
  return c;
}
