-- Run in the Supabase SQL editor. Supabase Auth owns auth.users; profiles are optional metadata.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.incidents (
  incident_number text primary key,
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null,
  service text not null,
  environment text not null check (environment in ('Production','Staging','Development')),
  severity text not null check (severity in ('Critical','High','Medium','Low')),
  status text not null default 'Investigating' check (status in ('Investigating','Resolved')),
  logs text not null default '',
  stack_trace text not null default '',
  ai_summary text,
  likely_root_cause text,
  confidence text,
  memory_used boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.incidents add column if not exists ai_analysis jsonb;
create sequence if not exists public.incident_number_seq start 1;
create or replace function public.assign_incident_number() returns trigger language plpgsql as $$
begin
  if new.incident_number is null or new.incident_number = '' then
    new.incident_number := 'INC-' || lpad(nextval('public.incident_number_seq')::text, 3, '0');
  end if;
  return new;
end; $$;
drop trigger if exists incidents_assign_number on public.incidents;
create trigger incidents_assign_number before insert on public.incidents for each row execute function public.assign_incident_number();

create table if not exists public.incident_logs (
  id bigint generated always as identity primary key,
  incident_number text not null references public.incidents(incident_number) on delete cascade,
  level text not null default 'info',
  message text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.incident_memories (
  id bigint generated always as identity primary key,
  incident_number text not null references public.incidents(incident_number) on delete cascade,
  memory_id text,
  recalled_at timestamptz not null default now(),
  similarity numeric,
  title text,
  content jsonb not null default '{}'::jsonb
);
create table if not exists public.incident_resolutions (
  id bigint generated always as identity primary key,
  incident_number text not null references public.incidents(incident_number) on delete cascade,
  root_cause text not null,
  solution text not null,
  notes text not null default '',
  recommendation_useful text not null default 'Yes',
  created_at timestamptz not null default now()
);
create table if not exists public.incident_timeline (
  id bigint generated always as identity primary key,
  incident_number text not null references public.incidents(incident_number) on delete cascade,
  event text not null,
  occurred_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_logs enable row level security;
alter table public.incident_memories enable row level security;
alter table public.incident_resolutions enable row level security;
alter table public.incident_timeline enable row level security;
-- Backend uses the service-role key and is responsible for user scoping. Never expose that key to a browser.
