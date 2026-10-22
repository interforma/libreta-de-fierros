-- Alternativa por máquina: qué hacer si está ocupada o no se entiende.
-- Se guarda en machines.alternative; el catálogo base vive en machine_alternatives
-- y un trigger la completa al crear las máquinas de un usuario nuevo.

alter table public.machines add column if not exists alternative text;

create table if not exists public.machine_alternatives (
  slug text primary key,
  alternative text not null
);
alter table public.machine_alternatives enable row level security;
create policy "catalog alternatives: read" on public.machine_alternatives for select to authenticated using (true);

insert into public.machine_alternatives (slug, alternative) values
  ('press_pecho','Press con mancuernas en banco plano, o press de pecho en polea.'),
  ('jalon_pecho','Jalón en polea alta con agarre neutro, o dominadas asistidas en máquina.'),
  ('press_hombros','Press con mancuernas sentado en banco con respaldo.'),
  ('remo_polea','Remo con apoyo en pecho, o remo con mancuerna a una mano apoyado en un banco.'),
  ('curl_biceps','Curl con mancuernas sentado, o curl en polea baja con barra.'),
  ('triceps_polea','Extensión con una mancuerna sobre la cabeza, sentado con respaldo, o máquina de tríceps.'),
  ('press_inclinado','Press inclinado con mancuernas en banco a unos 30°.'),
  ('remo_apoyo','Remo sentado en polea, o remo con mancuerna a una mano apoyado en un banco.'),
  ('pec_deck','Aperturas en cruce de poleas, o con mancuernas livianas en banco plano.'),
  ('jalon_cerrado','Jalón con barra y palmas hacia ti, o remo sentado en polea con agarre en V.'),
  ('elev_laterales','Polea baja a un brazo, de costado a la polea; o mancuernas livianas sentado.'),
  ('face_pull','Pájaros en el pec deck al revés (de frente al respaldo), o con mancuernas livianas inclinado hacia adelante.'),
  ('prensa','Sentadilla en Smith o en hack.'),
  ('ext_cuadriceps','Subida a cajón, o prensa a una pierna con poco peso.'),
  ('curl_femoral','La otra versión de la máquina (sentado o acostado), o curl a una pierna en polea baja con tobillera.'),
  ('aductores','Polea baja con tobillera, cerrando la pierna hacia adentro.'),
  ('pantorrillas_pie','Pantorrillas en la prensa, o en la máquina sentado.'),
  ('plancha','Plancha con las rodillas apoyadas, o con los antebrazos en un banco.'),
  ('smith','Prensa con pies altos, o sentadilla con una mancuerna al pecho (goblet).'),
  ('zancadas','Cajón más bajo, o zancada en el lugar tomado de una barra.'),
  ('abductores','Polea baja con tobillera abriendo la pierna, o banda elástica sobre las rodillas sentado.'),
  ('pantorrillas_sentado','Pantorrillas de pie, o en la prensa.'),
  ('crunch','Crunch en el suelo, o elevación de rodillas apoyado en paralelas.'),
  ('cinta','Bicicleta estática o elíptica.'),
  ('bici','Cinta caminando, elíptica o remoergómetro.'),
  ('remo_ergo','Bicicleta estática o elíptica.'),
  ('plancha_lateral','Plancha lateral con la rodilla de abajo apoyada.'),
  ('puente','Hip thrust con la espalda apoyada en un banco, o patada de glúteo en polea.')
on conflict (slug) do update set alternative = excluded.alternative;

create or replace function public.fill_machine_alternative() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.alternative is null then
    select a.alternative into new.alternative from public.machine_alternatives a where a.slug = new.slug;
  end if;
  return new;
end $$;

drop trigger if exists machines_fill_alternative on public.machines;
create trigger machines_fill_alternative before insert on public.machines
  for each row execute function public.fill_machine_alternative();

-- Máquinas que ya existen.
update public.machines m set alternative = a.alternative
  from public.machine_alternatives a where a.slug = m.slug and m.alternative is null;

-- La alternativa ya no va dentro de la descripción.
update public.machines set how_to = regexp_replace(how_to, '\s*Alternativa:[^.]*\.\s*$', '')
  where slug in ('elev_laterales', 'smith') and how_to ~ 'Alternativa:';
