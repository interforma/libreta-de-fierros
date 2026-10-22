-- Última sugerencia de alimentación del entrenador: {mode: 'dia'|'revisar', text, at, kcal, protein}
alter table public.profiles add column if not exists meal_ai jsonb;
