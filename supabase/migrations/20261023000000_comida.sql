-- Alimentación: alimentos y recetas habituales (foods) y lo comido cada día (meals).
-- Las cifras de cada comida se copian al registrarla, así el historial no cambia si después se edita el alimento.

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'producto' check (kind in ('producto', 'alimento', 'receta')),
  portion text not null default '1 porción',      -- "1 unidad (155 g)", "200 g crudos"
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  collagen_g numeric not null default 0 check (collagen_g >= 0), -- parte de la proteína que es colágeno
  fruit_veg numeric not null default 0 check (fruit_veg >= 0),   -- porciones de fruta o verdura
  source text not null default 'estimado' check (source in ('etiqueta', 'estimado', 'manual')),
  detail text not null default '',               -- ingredientes de una receta, notas
  uses int not null default 0,
  last_used timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  at timestamptz not null default now(),
  slot text not null check (slot in ('desayuno', 'colacion', 'almuerzo', 'once', 'cena')),
  food_id uuid references public.foods(id) on delete set null,
  name text not null,
  qty numeric not null default 1 check (qty > 0),
  kcal numeric not null check (kcal >= 0),         -- total de lo comido (ya multiplicado por qty)
  protein_g numeric not null default 0,
  collagen_g numeric not null default 0,
  fruit_veg numeric not null default 0,
  estimated boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index meals_user_date on public.meals (user_id, date);

alter table public.foods enable row level security;
alter table public.meals enable row level security;

create policy "own foods: read" on public.foods for select to authenticated using (user_id = (select auth.uid()));
create policy "own foods: add" on public.foods for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own foods: change" on public.foods for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own foods: remove" on public.foods for delete to authenticated using (user_id = (select auth.uid()));

create policy "own meals: read" on public.meals for select to authenticated using (user_id = (select auth.uid()));
create policy "own meals: add" on public.meals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own meals: change" on public.meals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own meals: remove" on public.meals for delete to authenticated using (user_id = (select auth.uid()));
