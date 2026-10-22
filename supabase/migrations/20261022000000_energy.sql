-- Balance energético: nivel de actividad, objetivo de calorías y valores indicados por un profesional.
alter table public.profiles
  add column if not exists activity text check (activity in ('baja','moderada','alta','muy_alta')),
  add column if not exists energy_goal text check (energy_goal in ('deficit','recomposicion','mantencion','superavit')),
  add column if not exists kcal_target smallint check (kcal_target between 1000 and 6000),   -- indicado por el nutricionista (reemplaza el cálculo)
  add column if not exists protein_target smallint check (protein_target between 30 and 400); -- g/día indicados por el nutricionista
