import { NextResponse } from "next/server";
import { askClaude, CoachError, MODEL_FAST, userDb } from "@/lib/coach";
import { machineContext } from "@/lib/machineContext";
import { redFlag } from "@/lib/health";

// Pregunta corta sobre un ejercicio, en medio del entrenamiento.

const SYSTEM = `Eres el entrenador de "Libreta de Fierros", una app personal de gimnasio. El usuario está en el gimnasio, entre series, y te hace una pregunta sobre el ejercicio que tiene delante.
Responde en español de Chile, tuteando, directo y práctico, en texto plano (sin markdown, sin emojis). Máximo 70 palabras.
Si la máquina está ocupada, propone una alternativa de su catálogo del mismo grupo muscular (o con mancuernas o polea si no hay) y con cuántas series y repeticiones hacerla.
Si menciona dolor o molestia: sugiere bajar la carga o cambiar el ejercicio hoy, y que la registre en la app. No diagnostiques ni recomiendes medicamentos.
Si la pregunta no tiene que ver con entrenamiento, responde en una frase que solo puedes ayudar con el entrenamiento.`;

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { slug, q } = await req.json().catch(() => ({}));
  if (!slug || typeof slug !== "string") return NextResponse.json({ error: "Falta el ejercicio." }, { status: 400 });
  const question = String(q || "").trim().slice(0, 300);
  if (!question) return NextResponse.json({ error: "Escribe tu pregunta." }, { status: 400 });

  // Señales de alarma antes que cualquier IA (pecho, falta de aire, mareo…)
  const flag = redFlag({ area: "Otra", intensity: 0, moment: null, note: question });
  if (flag?.level === "urgent") return NextResponse.json({ answer: `${flag.title}. ${flag.text}`, urgent: true });

  const ctx = await machineContext(db, slug);
  if (!ctx) return NextResponse.json({ error: "No encontré ese ejercicio en tu catálogo." }, { status: 404 });

  try {
    const answer = await askClaude({
      model: MODEL_FAST, system: SYSTEM, maxTokens: 300,
      content: `${ctx.text}${ctx.machine.guide ? `\nGUÍA QUE YA VIO:\n${ctx.machine.guide}` : ""}\n\nPREGUNTA: ${question}`,
    });
    return NextResponse.json({ answer });
  } catch (e) {
    const err = e as CoachError;
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
