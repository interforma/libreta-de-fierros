import { NextResponse } from "next/server";
import { askClaude, bestOf, CoachError, MODEL_FAST, repsLine, TANDAS_NOTE, userDb, wText, type SetRow } from "@/lib/coach";
import { machineContext } from "@/lib/machineContext";
import { redFlag } from "@/lib/health";

// Conversación con el entrenador sobre el ejercicio que la persona tiene delante, en medio del entrenamiento.
// Conoce la máquina, el perfil, las molestias, lo que lleva hecho hoy, las últimas sesiones de ese ejercicio,
// el objetivo del bloque y la conversación previa de hoy. Los números vienen resueltos desde aquí.

const SYSTEM = `Eres el entrenador de "Libreta de Fierros", una app personal de gimnasio. El usuario está en el gimnasio, entre series, y conversa contigo sobre el ejercicio que tiene delante.
Responde en español de Chile, tuteando, directo y práctico, en texto plano (sin markdown, sin emojis). Máximo 70 palabras. Si la pregunta sigue la conversación previa, responde en continuidad sin repetir lo ya dicho.
Usa los DATOS DE HOY y las SESIONES ANTERIORES para respuestas concretas: si pregunta por peso, di un número en la unidad de su máquina (sube de a 5 lb o 2,5 kg) y por qué. Respeta su forma de entrenar (pirámide con tandas) y el rango del bloque.
Si la máquina está ocupada, propone una alternativa de su catálogo del mismo grupo muscular (o con mancuernas o polea si no hay) y con cuántas series y repeticiones hacerla.
Si menciona dolor o molestia: sugiere bajar la carga o cambiar el ejercicio hoy, y que la registre en la app con "Registrar molestia". No diagnostiques ni recomiendes medicamentos.
No inventes datos. Si la pregunta no tiene que ver con entrenamiento, responde en una frase que solo puedes ayudar con el entrenamiento.`;

type Turn = { q: string; a: string };

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { slug, q, date, today, target, block } = body || {};
  if (!slug || typeof slug !== "string") return NextResponse.json({ error: "Falta el ejercicio." }, { status: 400 });
  const question = String(q || "").trim().slice(0, 300);
  if (!question) return NextResponse.json({ error: "Escribe tu pregunta." }, { status: 400 });
  const history: Turn[] = Array.isArray(body?.history)
    ? body.history.filter((t: any) => t && typeof t.q === "string" && typeof t.a === "string").slice(-4).map((t: any) => ({ q: t.q.slice(0, 300), a: t.a.slice(0, 600) }))
    : [];

  // Señales de alarma antes que cualquier IA (pecho, falta de aire, mareo…)
  const flag = redFlag({ area: "Otra", intensity: 0, moment: null, note: question });
  if (flag?.level === "urgent") return NextResponse.json({ answer: `${flag.title}. ${flag.text}`, urgent: true });

  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  const [ctx, { data: rows }] = await Promise.all([
    machineContext(db, slug),
    db.from("set_log").select("date,machine_slug,unit,kg,lb,reps,secs,done,feel,tandas").eq("machine_slug", slug).lt("date", day).eq("done", true).order("date", { ascending: false }).limit(60),
  ]);
  if (!ctx) return NextResponse.json({ error: "No encontré ese ejercicio en tu catálogo." }, { status: 404 });
  const u = ctx.machine.unit === "kg" ? "kg" : "lb";

  // últimas 3 sesiones de este ejercicio
  const all = (rows || []) as SetRow[];
  const dates = Array.from(new Set(all.map((r) => r.date))).slice(0, 3);
  const prev = dates.map((d) => {
    const b = bestOf(all.filter((r) => r.date === d));
    if (!b) return null;
    const ws = all.filter((r) => r.date === d && r.done).map((r) => (r.kg ? wText(Number(r.kg), r.lb != null ? Number(r.lb) : null, u) : r.secs ? `${r.secs} s` : "sin peso"));
    return `${d}: series ${ws.join(" / ")}; repeticiones ${repsLine(b)}${b.feel ? `; sensación ${b.feel}` : ""}`;
  }).filter(Boolean);

  // lo que lleva hoy (viene del teléfono: puede no estar sincronizado aún)
  const sets = Array.isArray(today?.sets) ? today.sets.slice(0, 8) : [];
  const todayLines = sets.map((s: any, i: number) => {
    const w = s?.kg != null || s?.lb != null ? wText(s.kg != null ? Number(s.kg) : null, s.lb != null ? Number(s.lb) : null, u) : s?.secs != null ? `${Number(s.secs)} s` : "sin peso";
    const t = Number(s?.tandas) || 1, td = Number(s?.tdone) || 0;
    const st = s?.done ? "hecha" : td > 0 ? `${td} de ${t} tandas hechas` : "pendiente";
    return `serie ${i + 1}: ${w} × ${s?.reps ?? "?"}${t > 1 ? `×${t}` : ""} (${st})`;
  });

  const content = [
    ctx.text,
    typeof block === "string" && block ? `BLOQUE ACTUAL: ${block.slice(0, 300)}` : "",
    typeof target === "string" && target ? `PLAN DE HOY PARA ESTE EJERCICIO: ${target.slice(0, 120)}` : "",
    TANDAS_NOTE,
    `DATOS DE HOY (${day}): ${todayLines.length ? todayLines.join("; ") : "aún no empieza este ejercicio"}${today?.feel ? `; sensación marcada: ${String(today.feel).slice(0, 20)}` : ""}.`,
    `SESIONES ANTERIORES DE ESTE EJERCICIO: ${prev.length ? prev.join(" | ") : "ninguna, es la primera vez"}.`,
    ctx.machine.guide ? `GUÍA QUE YA TIENE:\n${ctx.machine.guide}` : "",
    history.length ? `CONVERSACIÓN PREVIA DE HOY:\n${history.map((t) => `Usuario: ${t.q}\nTú: ${t.a}`).join("\n")}` : "",
    `PREGUNTA: ${question}`,
  ].filter(Boolean).join("\n");

  try {
    const answer = await askClaude({ model: MODEL_FAST, system: SYSTEM, maxTokens: 400, content });
    return NextResponse.json({ answer });
  } catch (e) {
    const err = e as CoachError;
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
