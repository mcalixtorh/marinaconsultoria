-- Central de Rotina — banco de dados (Supabase). Rode UMA vez em: SQL Editor › New query › Run.
-- O banco é só um "caderno" para a função /api/push: não há login de usuário.
-- Pode rodar de novo sem problema (nada é apagado).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- configurações internas (chaves de envio e segredo do agendador)
create table if not exists public.kv (
  name text primary key,
  value text not null
);

-- aparelhos que aceitaram receber avisos
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- avisos agendados (a agenda dos próximos dias, enviada pelo app)
create table if not exists public.scheduled (
  key text primary key,
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  sent boolean not null default false
);
create index if not exists scheduled_due_idx on public.scheduled (fire_at) where sent = false;

-- cópia dos dados do app (uma só linha)
create table if not exists public.app_state (
  id int primary key,
  data jsonb not null,
  updated_at_ms bigint not null
);

-- SEGURANÇA: com RLS ligado e nenhuma regra, ninguém de fora lê nem escreve nestas tabelas.
-- Só a função do servidor (chave de serviço) consegue. Isso protege as chaves de envio.
alter table public.kv enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.scheduled enable row level security;
alter table public.app_state enable row level security;

-- segredo que só o agendador e a função conhecem (gerado aqui dentro; você não copia nada)
insert into public.kv (name, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

-- agendador: a cada minuto, chama a função que envia os avisos que chegaram na hora
select cron.schedule(
  'push-send',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://marinaconsultoria.vercel.app/api/push?action=send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.kv where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
