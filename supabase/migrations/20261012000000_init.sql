-- Libreta de Fierros: esquema inicial
-- Todo es por usuario (user_id = auth.uid()) y queda protegido con RLS.

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  muscle_group text not null default '',
  how_to text not null default '',
  unit text not null default 'lb' check (unit in ('lb','kg')),
  settings text not null default '',          -- "Mis ajustes": asiento, agarre…
  photo_path text,                            -- foto propia en Storage (null = foto genérica)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  type text not null default 'fuerza' check (type in ('fuerza','cardio')),
  weekdays smallint[] not null default '{}',  -- 0 = domingo … 6 = sábado
  duration_min smallint,
  items jsonb not null default '[]',          -- [{m, k, sets, reps:[min,max], secs, min, rest, label, alt, per}]
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- Una fila por día entrenado. items: { <machine slug>: { unit, sets:[{kg,lb,reps,secs,done}], min, done, feel, note } }
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  routine_slug text,
  items jsonb not null default '{}',
  client_updated_at bigint not null default 0, -- reloj del teléfono, para resolver ediciones sin conexión
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index sessions_user_date_idx on public.sessions (user_id, date desc);

-- updated_at automático
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger machines_touch before update on public.machines for each row execute function public.touch_updated_at();
create trigger routines_touch before update on public.routines for each row execute function public.touch_updated_at();
create trigger sessions_touch before update on public.sessions for each row execute function public.touch_updated_at();

-- RLS: cada persona ve y edita solo lo suyo
alter table public.machines enable row level security;
alter table public.routines enable row level security;
alter table public.sessions enable row level security;

create policy "own machines" on public.machines for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own routines" on public.routines for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own sessions" on public.sessions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Vista plana de series para análisis (progreso, volumen, récords)
create or replace view public.set_log with (security_invoker = true) as
select s.user_id, s.date, s.routine_slug, e.key as machine_slug,
       coalesce(e.value->>'unit','kg') as unit,
       e.value->>'feel' as feel,
       (st.ord)::int as set_no,
       nullif(st.value->>'kg','')::numeric as kg,
       nullif(st.value->>'lb','')::numeric as lb,
       nullif(st.value->>'reps','')::int as reps,
       nullif(st.value->>'secs','')::int as secs,
       coalesce((st.value->>'done')::boolean,false) as done
from public.sessions s
cross join lateral jsonb_each(s.items) e
cross join lateral jsonb_array_elements(coalesce(e.value->'sets','[]'::jsonb)) with ordinality st(value, ord);
