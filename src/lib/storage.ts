import type { AppState } from '../types';
import { STATE_VERSION, seedState } from './seed';

const KEY = 'central-rotina:estado';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s && Array.isArray(s.items) && s.version === STATE_VERSION) return s;
    }
  } catch {
    /* armazenamento indisponível ou corrompido: começa do zero */
  }
  return seedState();
}

/** Retorna false se o navegador não deixou gravar (ex.: aba privada ou cheio). */
export function saveState(s: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function exportBackup(s: AppState): string {
  return JSON.stringify(s, null, 2);
}

/** Valida um arquivo de backup; devolve o estado ou uma mensagem de erro. */
export function parseBackup(text: string): { ok: true; state: AppState } | { ok: false; error: string } {
  try {
    const s = JSON.parse(text) as AppState;
    if (!s || !Array.isArray(s.items) || !Array.isArray(s.categories) || !Array.isArray(s.routines)) {
      return { ok: false, error: 'O arquivo não parece ser um backup da Central de Rotina.' };
    }
    return {
      ok: true,
      state: {
        ...seedState(),
        ...s,
        version: STATE_VERSION,
        alarms: s.alarms ?? [],
        notes: s.notes ?? [],
        priorities: s.priorities ?? {},
        missed: s.missed ?? [],
        snoozes: s.snoozes ?? [],
      },
    };
  } catch {
    return { ok: false, error: 'Não consegui ler o arquivo. Ele precisa ser um .json exportado por este app.' };
  }
}
