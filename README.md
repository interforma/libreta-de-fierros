# Libreta de Fierros

Registro personal de gimnasio pensado para usarse con una mano entre series: la rutina del día, peso en **lb o kg** con su equivalencia, temporizador de descanso y progreso por máquina.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS) · Vercel · PWA instalable.

## Puesta en marcha

```bash
cp .env.example .env.local   # completa la clave publicable de Supabase
npm install
npm run dev
```

## Datos (Supabase, proyecto `libreta-de-fierros`, región sa-east-1)

| Tabla | Qué guarda |
|---|---|
| `machines` | Catálogo por usuario: nombre, grupo muscular, cómo se usa, **unidad preferida (lb/kg)**, ajustes y foto propia |
| `routines` | Rutinas por usuario: días de la semana y lista de ejercicios (`items` jsonb) |
| `sessions` | Un registro por día entrenado (`items` jsonb con series, peso en kg y lb, reps, sensación, notas) |
| `set_log` (vista) | Una fila por serie, para análisis con SQL |

- Todo está protegido con **RLS**: cada usuario lee y escribe solo lo suyo.
- `seed_defaults()` carga el catálogo y las rutinas iniciales la primera vez que alguien entra.
- Las migraciones viven en `supabase/migrations/`.

## Uso sin señal

La app guarda cada cambio primero en el teléfono y luego lo sube a Supabase. Si no hay conexión, queda en cola (`localStorage`) y se envía al volver la señal. El service worker (`public/sw.js`) permite abrir la app sin conexión.

## Entrenador con Claude

- **Comentario de la sesión** (`/api/resumen`, modelo rápido): al completar la rutina, un logro concreto y una propuesta para la próxima vez.
- **Balance del bloque** (`/api/balance`): en la última semana de un bloque, qué avanzó, qué cuidar y qué proponer para el siguiente.
- **Orientación por molestias** (`/api/orientacion`).

Variables en Vercel: `ANTHROPIC_API_KEY` (obligatoria), `ANTHROPIC_MODEL` y `ANTHROPIC_MODEL_FAST` (opcionales).

## Estudiar el uso

Cada sesión guarda en silencio cuántas veces se deshizo una serie, se cambió la unidad o se escribió un valor a mano (`items.__uso`), y la respuesta a "¿Algo te costó hoy?" (`items.__cierre`). En el editor SQL de Supabase:

```sql
select date, items->'__uso' as uso, items->'__cierre' as cierre,
       round(((items->>'__t1')::numeric - (items->>'__t0')::numeric) / 60000) as minutos
from sessions order by date desc;
```
