-- Guía de uso por máquina (generada con Claude y guardada para no pedirla de nuevo)
-- y fotos propias de las máquinas del gimnasio en Storage.

alter table public.machines
  add column if not exists guide text,
  add column if not exists guide_at timestamptz,
  add column if not exists source text not null default 'catalogo' check (source in ('catalogo', 'foto'));

-- Bucket privado: cada usuario guarda sus fotos en una carpeta con su id (<uid>/<archivo>.jpg).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machine-photos', 'machine-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "own machine photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'machine-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own machine photos: add" on storage.objects for insert to authenticated
  with check (bucket_id = 'machine-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own machine photos: change" on storage.objects for update to authenticated
  using (bucket_id = 'machine-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own machine photos: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'machine-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
