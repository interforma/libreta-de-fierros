-- Lista de espera de la beta: correos dejados en interforma.digital/libreta.
-- Solo inserción pública; nadie puede leerla con la clave publicable.
-- Consultar desde el editor SQL de Supabase: select email, created_at from lista_espera order by created_at;
create table if not exists public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 6 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  origen text not null default 'landing' check (char_length(origen) <= 40),
  created_at timestamptz not null default now()
);
create unique index if not exists lista_espera_email_key on public.lista_espera (lower(email));
alter table public.lista_espera enable row level security;
create policy "lista_espera_insert_publico" on public.lista_espera
  for insert to anon, authenticated
  with check (true);
revoke select, update, delete on public.lista_espera from anon, authenticated;
grant insert on public.lista_espera to anon, authenticated;
