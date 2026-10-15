# Libreta de Fierros: notas para Claude

- App personal de Sergio (Interforma) para registrar su entrenamiento. Interfaz y textos en **español de Chile**, tono directo.
- Stack: Next.js 15 App Router + Supabase (proyecto `iuamjwwgivnmgrqdjqas`, sa-east-1) + Vercel. Cliente Supabase solo en navegador (`lib/supabase.ts`).
- Lógica pura en `lib/logic.ts`; interfaz en `components/App.tsx` (un solo componente cliente). Estilos en `app/globals.css` con tokens de color y modo oscuro.
- El peso se guarda siempre en **kg y lb** (`setW`), y la unidad se recuerda por máquina (`machines.unit`). El progreso se calcula en kg.
- Cambios de esquema: nueva migración en `supabase/migrations/` y aplicarla al proyecto. Toda tabla nueva lleva RLS por `user_id = auth.uid()`.
- Diseñado para una mano en el gimnasio: botones de al menos 44 px y nada que obligue a escribir si un + o − sirve.
- En `sessions.items`, las claves que empiezan con `__` no son ejercicios: `__t0`/`__t1` (inicio y término), `__uso` (contadores de fricción), `__cierre` (respuesta a "¿Algo te costó hoy?"), `__resumen` (comentario del entrenador), `__suplementos`.
- IA del entrenador en `lib/coach.ts` y `app/api/{resumen,balance,orientacion}`: los números se calculan en el servidor y Claude solo redacta. Modelo rápido `ANTHROPIC_MODEL_FAST` (por defecto Haiku) para mensajes cortos.
- Criterio de producto: la app propone o avisa en el momento justo; no agrega datos que nadie pidió.
