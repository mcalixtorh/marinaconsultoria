import type { AppState, GcalMeta, Item, Kind } from '../types';
import type { CalEvent } from '../../api/calendar';
import { NO_RECUR } from './recurrence';
import { normalize } from './search';

export type GcalEvent = CalEvent;

export interface MergeResult {
  state: AppState;
  added: number;
  updated: number;
  removed: number;
}

const MAX_IGNORED = 1000;

export function addIgnored(gcal: GcalMeta | undefined, ext: string): GcalMeta {
  const ignored = [...new Set([...(gcal?.ignored ?? []), ext])].slice(-MAX_IGNORED);
  return { lastSync: gcal?.lastSync ?? 0, ignored };
}

const keyOf = (title: string, date: string, time: string) => `${normalize(title)}|${date}|${time}`;

export function guessKind(e: GcalEvent): Kind {
  if (e.allDay || !e.time) return /^lembrete/i.test(e.title) ? 'lembrete' : 'tarefa';
  return /^(publicar|conte[uú]do)/i.test(e.title) ? 'tarefa' : 'compromisso';
}

export function guessCategory(e: GcalEvent, valid: (id: string) => boolean): string {
  const t = e.title;
  const rules: [RegExp, string][] = [
    [/^entrevista/i, 'entrevistas'],
    [/otimiza|consultoria|cliente/i, 'clientes'],
    [/^conte[uú]do dia/i, 'conteudo'],
    [/linkedin/i, 'linkedin'],
    [/instagram/i, 'instagram'],
    [/alice|pediatr/i, 'alice'],
    [/ritual|autocuidado|beleza/i, 'autocuidado'],
    [/cart[aã]o|chatgpt|pagar|fatura|boleto/i, 'financeiro'],
    [/consulta|m[eé]dic|dentista|exame/i, 'saude'],
  ];
  for (const [re, id] of rules) if (re.test(t) && valid(id)) return id;
  return valid('compromissos') ? 'compromissos' : 'rs';
}

/**
 * Junta os eventos do Google ao app. Regras:
 * - O Google manda no título, data, horário, descrição e link; o app guarda o resto
 *   (concluído, categoria, prioridade, lembretes, pessoa).
 * - Itens importados antes (sem id do Google) são reconhecidos por título + data + horário,
 *   para não duplicar.
 * - O que a Marina apagou/cancelou aqui não volta (lista "ignored").
 * - Evento que sumiu do Google some do app, mas só do que ainda está por vir e só se a
 *   leitura trouxe algum evento (uma leitura vazia nunca apaga nada).
 */
export function mergeCalendar(state: AppState, events: GcalEvent[], win: { from: string; to: string }, today: string, now = Date.now()): MergeResult {
  const ignored = new Set(state.gcal?.ignored ?? []);
  const validCat = (id: string) => state.categories.some((c) => c.id === id);
  let items = [...state.items];
  let added = 0, updated = 0, removed = 0;

  const byExt = new Map<string, number>();
  const legacy = new Map<string, number>();
  items.forEach((it, i) => {
    if (it.ext) byExt.set(it.ext, i);
    else if (it.src === 'Google Agenda') legacy.set(keyOf(it.title, it.date, it.time), i);
  });

  const seen = new Set<string>();
  for (const ev of events) {
    if (ignored.has(ev.id)) continue;
    seen.add(ev.id);
    let idx = byExt.get(ev.id);
    if (idx === undefined) {
      const k = keyOf(ev.title, ev.date, ev.time);
      const hit = legacy.get(k);
      if (hit !== undefined) {
        idx = hit;
        legacy.delete(k);
      }
    }
    if (idx !== undefined) {
      const old = items[idx];
      const next: Item = { ...old, ext: ev.id, title: ev.title, date: ev.date, time: ev.time, end: ev.end, link: ev.link || old.link, desc: ev.description || old.desc };
      if (!next.time) next.rem = [];
      const changed = next.ext !== old.ext || next.title !== old.title || next.date !== old.date || next.time !== old.time || next.end !== old.end || next.link !== old.link || next.desc !== old.desc;
      if (changed) {
        items[idx] = next;
        updated++;
      }
    } else {
      items.push({
        id: `g-${ev.id.slice(5, 40)}-${Math.random().toString(36).slice(2, 6)}`, title: ev.title, desc: ev.description, kind: guessKind(ev), date: ev.date, time: ev.time, end: ev.end,
        cat: guessCategory(ev, validCat), prio: 'media', status: 'pendente', rem: ev.time ? [30] : [], recur: { ...NO_RECUR }, doneDates: [], person: '', link: ev.link, src: 'Google Agenda', ext: ev.id,
      });
      added++;
    }
  }

  if (events.length > 0) {
    const lo = win.from > today ? win.from : today;
    const before = items.length;
    items = items.filter((it) => !(it.ext && !seen.has(it.ext) && !ignored.has(it.ext) && it.date >= lo && it.date <= win.to));
    removed = before - items.length;
  }

  const changed = added + updated + removed > 0;
  return {
    state: { ...state, items, gcal: { lastSync: now, ignored: [...ignored] }, updatedAt: changed ? now : state.updatedAt },
    added,
    updated,
    removed,
  };
}
