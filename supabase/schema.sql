-- Central de Rotina — banco (Supabase / Postgres)
-- Rode este arquivo uma vez em: Supabase › SQL Editor.

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at_ms bigint not null
);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null
);

create table if not exists public.scheduled_notifications (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  ring boolean not null default false,
  sent boolean not null default false,
  primary key (user_id, key)
);
create index if not exists scheduled_due_idx on public.scheduled_notifications (fire_at) where sent = false;

-- Cada pessoa só enxerga e altera as próprias linhas.
alter table public.app_state enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.scheduled_notifications enable row level security;

create policy "app_state: dona" on public.app_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push: dona" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "avisos: dona" on public.scheduled_notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Agendador: chama a função send-reminders a cada minuto.
-- 1) Ative as extensões em Database › Extensions: pg_cron e pg_net.
-- 2) Troque <PROJETO> e <SERVICE_ROLE_KEY> abaixo e rode.
-- select cron.schedule(
--   'send-reminders', '* * * * *',
--   $$ select net.http_post(
--        url := 'https://<PROJETO>.supabase.co/functions/v1/send-reminders',
--        headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json')
--      ); $$
-- );
