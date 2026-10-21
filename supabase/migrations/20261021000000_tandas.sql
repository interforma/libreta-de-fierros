-- Pirámide: una serie puede tener varias tandas con el mismo peso.
-- reps sigue siendo repeticiones por tanda; tandas = cuántas veces se repitió (1 si no se indicó).
create or replace view public.set_log with (security_invoker = true) as
select s.user_id, s.date, s.routine_slug, e.key as machine_slug,
       coalesce(e.value->>'unit','kg') as unit,
       e.value->>'feel' as feel,
       (st.ord)::int as set_no,
       nullif(st.value->>'kg','')::numeric as kg,
       nullif(st.value->>'lb','')::numeric as lb,
       nullif(st.value->>'reps','')::int as reps,
       nullif(st.value->>'secs','')::int as secs,
       coalesce((st.value->>'done')::boolean,false) as done,
       coalesce(nullif(st.value->>'tandas','')::int, 1) as tandas
from public.sessions s
cross join lateral jsonb_each(s.items) e
cross join lateral jsonb_array_elements(coalesce(e.value->'sets','[]'::jsonb)) with ordinality st(value, ord);
