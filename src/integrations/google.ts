import type { Item } from '../types';

/**
 * Google Agenda — ESTRUTURA PREPARADA, ainda sem conexão.
 *
 * Hoje os eventos do Google Agenda entram uma vez, pela carga inicial
 * (src/data/initial.json). A sincronização contínua precisa de OAuth, que só
 * funciona com um ID de cliente do Google Cloud (veja o README).
 *
 * O contrato abaixo é o que a próxima etapa vai implementar, sem mexer nas telas.
 */
export interface GoogleCalendarSync {
  /** Entra com a conta Google e guarda o token. */
  connect(): Promise<void>;
  /** Traz eventos a partir de uma data e os converte em itens do app. */
  importEvents(fromISO: string): Promise<Item[]>;
  /** Cria/atualiza no Google o evento correspondente a um item. */
  exportItem(item: Item): Promise<{ eventId: string }>;
}

export const googleSync: GoogleCalendarSync | null = null;
