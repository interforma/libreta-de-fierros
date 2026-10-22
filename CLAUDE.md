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
- Máquinas: `machines.guide` guarda la guía paso a paso (se genera una vez en `/api/maquina/guia`). Fotos propias en el bucket privado `machine-photos`, carpeta `<uid>/`, con URL firmada; `source = 'foto'` para las agregadas con `/api/maquina/foto`.
- Pirámide: cada serie puede tener `tandas` (mismo peso repetido) y `tdone`; `reps` es por tanda. Se muestra como "10×3" (`repsOf` en el cliente, `repsLine` en el servidor). `set_log` tiene la columna `tandas`.
- Fotos de progreso: `items.<m>.photos` con rutas en `machine-photos/<uid>/progreso/<fecha>/`; cola sin señal en IndexedDB (`lib/progressPhotos.ts`). Galería por máquina en Progreso.
- Conversación con el entrenador por ejercicio: `components/CoachChat.tsx` → `/api/maquina/pregunta` (conoce las series de hoy, las últimas 3 sesiones, el bloque y hasta 4 turnos previos). Se guarda en `items.<m>.chat`. Punto es la cara de las respuestas.
- Energía y alimentación: `energy()` en `lib/health.ts` calcula basal (Mifflin-St Jeor) × factor de actividad (sin nivel elegido, `daysFactor` según días por semana: 1,28 + 0,06 por día), gasto y meta de kcal/proteína según `profiles.energy_goal`; las cifras del nutricionista (`kcal_target`, `protein_target`) mandan. `/api/alimentacion` (modo `dia` o `revisar`) solo redacta con esas cifras y guarda la última respuesta en `profiles.meal_ai` (no se reenvía al guardar el perfil). Menores de 18: no sugiere comidas.
