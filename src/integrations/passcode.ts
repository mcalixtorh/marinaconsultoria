/** Senha que o app manda às funções do servidor (assistente e Google Agenda). Fica só neste aparelho. */
const KEY = 'central-rotina:assistente-senha';
export const PASS_EVENT = 'rotina-senha';

export function readPass(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePass(v: string): void {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: pede a senha de novo na próxima vez */
  }
  window.dispatchEvent(new Event(PASS_EVENT));
}
