export type Kind = 'tarefa' | 'compromisso' | 'lembrete';
export type Prio = 'baixa' | 'media' | 'alta' | 'urgente';
/** "atrasado" nunca é gravado: é calculado a partir da data. */
export type Status = 'pendente' | 'andamento' | 'concluido';
export type RecurType = 'none' | 'daily' | 'weekly' | 'monthly' | 'month_first' | 'custom';
export type RecurUnit = 'day' | 'week' | 'month';

export interface Recur {
  type: RecurType;
  /** 0 = domingo … 6 = sábado (usado em "weekly") */
  weekdays: number[];
  /** intervalo do "custom": a cada n unidades */
  n: number;
  unit: RecurUnit;
}

export interface Item {
  id: string;
  title: string;
  desc: string;
  kind: Kind;
  /** AAAA-MM-DD; vazio = "A organizar" */
  date: string;
  /** HH:MM; vazio = sem horário */
  time: string;
  end: string;
  cat: string;
  prio: Prio;
  status: Status;
  /** minutos de antecedência de cada lembrete (0 = no horário) */
  rem: number[];
  recur: Recur;
  /** datas (AAAA-MM-DD) das ocorrências concluídas, para itens recorrentes */
  doneDates?: string[];
  /** cliente ou candidata ligada ao item (opcional, entra na busca) */
  person?: string;
  link: string;
  src: string;
}

export interface Category {
  id: string;
  name: string;
  group: 'trabalho' | 'pessoal';
  color: string;
}

export interface RoutineStep {
  id: string;
  t: string;
}

export interface Routine {
  id: string;
  name: string;
  steps: RoutineStep[];
  /** data → ids das etapas concluídas naquele dia */
  done: Record<string, string[]>;
}

export interface Alarm {
  id: string;
  time: string;
  name: string;
  days: number[];
  /** true = toda semana nos dias escolhidos; false = toca uma vez e desativa */
  repeat: boolean;
  enabled: boolean;
}

export interface Note {
  id: string;
  at: number;
  text: string;
}

export interface DayPriority {
  text: string;
  done: boolean;
}

export interface MissedNotice {
  key: string;
  title: string;
  body: string;
  at: number;
}

export interface Snooze {
  id: string;
  alarmId: string;
  name: string;
  at: number;
}

export interface AppState {
  version: number;
  items: Item[];
  categories: Category[];
  routines: Routine[];
  alarms: Alarm[];
  notes: Note[];
  /** data → 3 prioridades do dia */
  priorities: Record<string, DayPriority[]>;
  /** última verificação de lembretes (ms) */
  lastCheck: number;
  missed: MissedNotice[];
  snoozes: Snooze[];
  updatedAt: number;
}

export interface Occurrence {
  item: Item;
  /** data desta ocorrência */
  date: string;
  done: boolean;
}
