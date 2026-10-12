-- Perfil del deportista y registro de molestias.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '',
  sex text check (sex in ('hombre','mujer','otro')),
  age smallint check (age between 10 and 110),
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  weight_kg numeric(5,1) check (weight_kg between 25 and 300),
  sport_history text not null default '',   -- trayectoria deportiva
  gym_since date,                           -- desde cuándo entrena en gimnasio
  days_per_week smallint check (days_per_week between 1 and 7),
  goal text check (goal in ('musculo','fuerza','salud','rendimiento','bajar_grasa')),
  conditions text not null default '',      -- lesiones o condiciones a considerar
  supplements jsonb not null default '[]',  -- [{name, dose, timing, since}]
  nutrition text not null default '',       -- resumen del plan de alimentación
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table public.discomforts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  area text not null,                       -- hombro, rodilla, espalda baja…
  side text check (side in ('izquierda','derecha','ambos','centro')),
  intensity smallint not null check (intensity between 1 and 10),
  moment text check (moment in ('durante','despues','reposo')),
  machine_slug text,                        -- ejercicio relacionado, si hubo
  note text not null default '',
  resolved boolean not null default false,
  advice text,                              -- orientación de la IA (texto)
  advice_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index discomforts_user_date_idx on public.discomforts (user_id, date desc);
create trigger discomforts_touch before update on public.discomforts for each row execute function public.touch_updated_at();
alter table public.discomforts enable row level security;
create policy "own discomforts" on public.discomforts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
