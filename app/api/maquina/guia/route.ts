import { NextResponse } from "next/server";
import { askClaude, CoachError, MODEL_DEEP, userDb } from "@/lib/coach";
import { machineContext } from "@/lib/machineContext";

// Guía paso a paso de una máquina. Se genera una vez y queda guardada en machines.guide.

const SYSTEM = `Eres el entrenador de "Libreta de Fierros", una app personal de gimnasio. El usuario no recuerda bien cómo se usa una máquina y la tiene delante.
Explica en español de Chile, tuteando, con frases cortas y palabras simples (si usas un término técnico, explícalo en la misma frase). Texto plano, sin markdown, sin emojis. Máximo 130 palabras.
Usa estas partes, cada una con su título y dos puntos en su propia línea, y 1 a 3 frases en cada una:
Ajusta: asiento, respaldo, rodillos o agarre antes de empezar, y cómo saber que quedó bien.
Movimiento: cómo se hace la repetición, de principio a fin, y el ritmo (por ejemplo, subir en 1 segundo y bajar en 2).
Respira: cuándo soltar y tomar aire.
Evita: los 2 errores más comunes.
Agrega una última parte "Cuidado:" solo si hay una molestia activa o una condición del perfil que tenga que ver con este ejercicio.
Si este tipo de máquina suele variar entre gimnasios, dilo en una frase. No diagnostiques ni recomiendes medicamentos.`;

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { slug, refresh } = await req.json().catch(() => ({}));
  if (!slug || typeof slug !== "string") return NextResponse.json({ error: "Falta el ejercicio." }, { status: 400 });

  const ctx = await machineContext(db, slug);
  if (!ctx) return NextResponse.json({ error: "No encontré ese ejercicio en tu catálogo." }, { status: 404 });
  if (ctx.machine.guide && !refresh) return NextResponse.json({ guide: ctx.machine.guide });

  try {
    const guide = await askClaude({ model: MODEL_DEEP, system: SYSTEM, content: ctx.text, maxTokens: 600 });
    const guide_at = new Date().toISOString();
    await db.from("machines").update({ guide, guide_at }).eq("slug", slug);
    return NextResponse.json({ guide, guide_at });
  } catch (e) {
    const err = e as CoachError;
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
