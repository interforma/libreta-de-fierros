# Libreta de Fierros: notas para Claude

- App personal de Sergio (Interforma) para registrar su entrenamiento. Interfaz y textos en **español de Chile**, tono directo.
- Stack: Next.js 15 App Router + Supabase (proyecto `iuamjwwgivnmgrqdjqas`, sa-east-1) + Vercel. Cliente Supabase solo en navegador (`lib/supabase.ts`).
- Lógica pura en `lib/logic.ts`; interfaz en `components/App.tsx` (un solo componente cliente). Estilos en `app/globals.css` con tokens de color y modo oscuro.
- El peso se guarda siempre en **kg y lb** (`setW`), y la unidad se recuerda por máquina (`machines.unit`). El progreso se calcula en kg.
- Cambios de esquema: nueva migración en `supabase/migrations/` y aplicarla al proyecto. Toda tabla nueva lleva RLS por `user_id = auth.uid()`.
- Diseñado para una mano en el gimnasio: botones de al menos 44 px y nada que obligue a escribir si un + o − sirve.
