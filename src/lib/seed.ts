import initial from '../data/initial.json';
import type { AppState, Item } from '../types';

export const STATE_VERSION = 1;

/** Estado de partida: tudo importado do Google Agenda e das anotações da Marina. */
export function seedState(now = Date.now()): AppState {
  return {
    version: STATE_VERSION,
    items: (initial.items as unknown as Item[]).map((i) => ({ ...i, doneDates: i.doneDates ?? [] })),
    categories: initial.categories as AppState['categories'],
    routines: initial.routines as AppState['routines'],
    alarms: initial.alarms as AppState['alarms'],
    notes: initial.notes as AppState['notes'],
    priorities: {},
    lastCheck: now,
    missed: [],
    snoozes: [],
    updatedAt: now,
  };
}
