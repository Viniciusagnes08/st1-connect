-- ST1 Connect: dados operacionais reais multiárea.
-- Ambiente de homologação, sem registros de exemplo e sem exclusões.
create schema if not exists st1_services;
revoke all on schema st1_services from public, anon, authenticated;
grant usage on schema st1_services to st1_connect_preview;

create sequence if not exists st1_services.protocol_seq;
revoke all on sequence st1_services.protocol_seq from public, anon, authenticated;
grant usage, select on sequence st1_services.protocol_seq to st1_connect_preview;

create table if not exists st1_services.requests (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  requester_user_id text not null,
  requester_email text not null,
  area text not null check(area in ('geral','ouvidoria','comercial','crm','ti','marketing','financeiro','administrativo')),
  category text not null,
  title text not null check(char_length(title) between 6 and 160),
  description text not null check(char_length(description) between 12 and 5000),
  confidential boolean not null default false,
  state text not null default 'Novo'
    check (state in ('Novo','Em triagem','Em atendimento','Pendente','Resolvido','Fechado')),
  assigned_to_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint confidential_ouvidoria check (area <> 'ouvidoria' or confidential)
);
create index if not exists service_requests_requester_idx
  on st1_services.requests(requester_user_id,created_at desc);
create index if not exists service_requests_area_idx
  on st1_services.requests(area,state,created_at desc);

create table if not exists st1_services.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references st1_services.requests(id) on delete restrict,
  actor_user_id text not null,
  event_type text not null check(event_type in ('created','state_changed','note_added')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists service_events_request_idx
  on st1_services.request_events(request_id,created_at,id);

create table if not exists st1_services.submission_keys (
  actor_key text not null,
  idempotency_key text not null,
  request_id uuid not null references st1_services.requests(id) on delete restrict,
  payload_hash text not null check(char_length(payload_hash)=64),
  created_at timestamptz not null default now(),
  primary key(actor_key,idempotency_key)
);
create index if not exists service_keys_request_idx on st1_services.submission_keys(request_id);

alter table st1_services.requests enable row level security;
alter table st1_services.request_events enable row level security;
alter table st1_services.submission_keys enable row level security;

revoke all on all tables in schema st1_services from public, anon, authenticated;
grant select, insert, update on table st1_services.requests to st1_connect_preview;
grant select, insert on table st1_services.request_events to st1_connect_preview;
grant select, insert on table st1_services.submission_keys to st1_connect_preview;

-- Única role de runtime: os endpoints autenticados filtram por autor e Master.
-- Nenhum acesso direto é disponibilizado a anon/authenticated no Data API.
create policy st1_services_backend_select on st1_services.requests
  for select to st1_connect_preview using (true);
create policy st1_services_backend_insert on st1_services.requests
  for insert to st1_connect_preview with check (true);
create policy st1_services_backend_update on st1_services.requests
  for update to st1_connect_preview using (true) with check (true);
create policy st1_services_events_select on st1_services.request_events
  for select to st1_connect_preview using (true);
create policy st1_services_events_insert on st1_services.request_events
  for insert to st1_connect_preview with check (true);
create policy st1_services_keys_select on st1_services.submission_keys
  for select to st1_connect_preview using (true);
create policy st1_services_keys_insert on st1_services.submission_keys
  for insert to st1_connect_preview with check (true);
