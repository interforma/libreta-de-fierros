-- Balance del bloque guardado en el servidor (antes vivía solo en el teléfono).
-- tips: sugerencia corta por ejercicio del bloque siguiente, que se muestra en su tarjeta
-- la primera vez que toca ese ejercicio en el bloque nuevo.
-- Forma: { text, done, planned, at, tips: { "<machine_slug>": "<sugerencia>" } }
alter table public.blocks add column if not exists balance jsonb;
