-- Bloques de entrenamiento (ciclos de 4 semanas) y controles con profesionales.

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  weeks smallint not null default 4 check (weeks between 1 and 16),
  deload_week smallint check (deload_week between 1 and 16), -- semana de descarga (null = sin descarga)
  focus text not null default '',                             -- qué busca el bloque, en palabras simples
  created_at timestamptz not null default now(),
  unique (user_id, start_date)
);
alter table public.blocks enable row level security;
create policy "own blocks" on public.blocks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.routines add column block_id uuid references public.blocks(id) on delete cascade;
create index routines_block_idx on public.routines (block_id);

create table public.checkups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  kind text not null default 'nutricionista' check (kind in ('nutricionista','kinesiologo','medico','entrenador','otro')),
  professional text not null default '',
  weight_kg numeric(5,1),
  body_fat_pct numeric(4,1),
  muscle_kg numeric(5,1),
  waist_cm numeric(5,1),
  notes text not null default '',   -- indicaciones recibidas
  next_date date,                   -- próximo control
  created_at timestamptz not null default now()
);
create index checkups_user_date_idx on public.checkups (user_id, date desc);
alter table public.checkups enable row level security;
create policy "own checkups" on public.checkups for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- seed_defaults: además de máquinas y rutinas, crea "Bloque 1" para usuarios nuevos y le asigna las rutinas.
create or replace function public.seed_block_one() returns void
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); b uuid;
begin
  if uid is null then return; end if;
  if exists (select 1 from public.routines where user_id = uid and block_id is null) then
    select id into b from public.blocks where user_id = uid order by start_date limit 1;
    if b is null then
      insert into public.blocks (user_id, name, start_date, weeks, deload_week, focus)
      values (uid, 'Bloque 1', current_date, 4, 4, 'Adaptación: aprender las máquinas y encontrar los pesos de trabajo.')
      returning id into b;
    end if;
    update public.routines set block_id = b where user_id = uid and block_id is null;
  end if;
end $$;
revoke all on function public.seed_block_one() from public, anon;
grant execute on function public.seed_block_one() to authenticated;
