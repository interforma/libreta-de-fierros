import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { redFlag, bmi, monthsSince, GOALS, type Discomfort, type Profile } from "@/lib/health";
import { activeBlock, isDeload, weekOf, type Block } from "@/lib/logic";

// Orientación con Claude para una molestia registrada.
// Usa el token del usuario: Supabase aplica RLS, así que solo lee y escribe sus propios datos.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

const SYSTEM = `Eres el asistente de entrenamiento de "Libreta de Fierros", una app personal de registro de gimnasio.
Ayudas a un deportista a decidir cómo seguir entrenando cuando reporta una molestia. No eres médico ni kinesiólogo: no diagnosticas, no nombras lesiones como certezas y no recomiendas medicamentos ni dosis.
Responde en español de Chile, tono directo y cercano, en texto plano (sin markdown, sin asteriscos), máximo unas 170 palabras, con estas cuatro partes, cada una iniciada por su título y dos puntos en su propia línea:
Hoy: qué hacer en la sesión de hoy con esa zona (seguir, bajar carga, evitar el ejercicio).
Ajustes: técnica, rango de movimiento, carga o repeticiones que conviene cambiar.
Alternativas: 1 o 2 ejercicios del catálogo del usuario que cargan menos la zona.
Consulta si: señales concretas para ir a un kinesiólogo o médico (dolor que no baja en 1–2 semanas, hinchazón, pérdida de fuerza, dolor nocturno, adormecimiento, etc.).
Ten en cuenta la edad, la trayectoria, las condiciones del perfil, el bloque de entrenamiento en curso y las indicaciones de sus profesionales (no las contradigas). Si la información no alcanza, dilo y sé conservador.`;

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "La orientación con IA aún no está activada (falta la clave de la API de Claude en Vercel)." }, { status: 503 });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") return NextResponse.json({ error: "Falta la molestia." }, { status: 400 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const [{ data: d }, { data: p }, { data: machines }, { data: recent }, { data: history }, { data: blocks }, { data: checks }] = await Promise.all([
    db.from("discomforts").select("*").eq("id", id).maybeSingle(),
    db.from("profiles").select("*").maybeSingle(),
    db.from("machines").select("slug,name,muscle_group"),
    db.from("set_log").select("date,machine_slug,unit,kg,lb,reps,done,feel").eq("done", true).order("date", { ascending: false }).limit(60),
    db.from("discomforts").select("date,area,side,intensity,resolved").order("date", { ascending: false }).limit(10),
    db.from("blocks").select("id,name,start_date,weeks,deload_week,focus"),
    db.from("checkups").select("date,kind,weight_kg,body_fat_pct,muscle_kg,waist_cm,notes").order("date", { ascending: false }).limit(3),
  ]);
  if (!d) return NextResponse.json({ error: "No encontré esa molestia." }, { status: 404 });
  const dis = d as Discomfort;

  const flag = redFlag(dis);
  if (flag?.level === "urgent") {
    return NextResponse.json({ error: flag.text }, { status: 422 });
  }

  const prof = (p || {}) as Partial<Profile>;
  const name = (slug: string | null) => (machines || []).find((m: any) => m.slug === slug)?.name || slug;
  const b = prof.height_cm && prof.weight_kg ? bmi(prof as Profile) : null;
  const related = (recent || []).filter((r: any) => !dis.machine_slug || r.machine_slug === dis.machine_slug).slice(0, 12);

  const bl = activeBlock((blocks || []) as Block[], dis.date);
  const blockLine = bl
    ? `BLOQUE ACTUAL: ${bl.name}, semana ${weekOf(bl, dis.date)} de ${bl.weeks}${isDeload((blocks || []) as Block[], dis.date) ? " (semana de descarga)" : ""}. Enfoque: ${bl.focus}`
    : ``;
  const ckLines = (checks || []).map((c: any) => {
    const ms = [c.weight_kg != null && `peso ${c.weight_kg} kg`, c.body_fat_pct != null && `grasa ${c.body_fat_pct} %`, c.muscle_kg != null && `masa muscular ${c.muscle_kg} kg`, c.waist_cm != null && `cintura ${c.waist_cm} cm`].filter(Boolean).join(", ");
    return `${c.date} ${c.kind}${ms ? `: ${ms}` : ""}${c.notes ? `. Indicaciones: ${String(c.notes).slice(0, 300)}` : ""}`;
  });

  const context = [
    `PERFIL: ${prof.sex || "sexo no indicado"}, ${prof.age ?? "?"} años, ${prof.height_cm ?? "?"} cm, ${prof.weight_kg ?? "?"} kg${b ? ` (IMC ${b.toFixed(1)})` : ""}.`,
    `Trayectoria: ${prof.sport_history || "no indicada"}. En gimnasio hace ${monthsSince(prof.gym_since ?? null) ?? "?"} meses, ${prof.days_per_week ?? "?"} días por semana.`,
    `Objetivo: ${GOALS.find((g) => g[0] === prof.goal)?.[1] || "no indicado"}. Condiciones o lesiones: ${prof.conditions || "ninguna indicada"}.`,
    `Suplementos: ${(prof.supplements || []).map((s) => `${s.name} ${s.dose}`).join("; ") || "ninguno"}.`,
    blockLine,
    ckLines.length ? `CONTROLES CON PROFESIONALES (más reciente primero): ${ckLines.join(" | ")}` : ``,
    ``,
    `MOLESTIA (${dis.date}): zona ${dis.area}${dis.side ? ` ${dis.side}` : ""}, intensidad ${dis.intensity}/10, ${dis.moment || "momento no indicado"}${dis.machine_slug ? `, relacionada con ${name(dis.machine_slug)}` : ""}.`,
    `Descripción del usuario: ${dis.note || "(sin descripción)"}`,
    flag ? `ALERTA DE LA APP: ${flag.title}. ${flag.text}` : ``,
    ``,
    `MOLESTIAS ANTERIORES: ${(history || []).filter((h: any) => h.date !== dis.date || h.area !== dis.area).map((h: any) => `${h.date} ${h.area} ${h.side || ""} ${h.intensity}/10${h.resolved ? " (resuelta)" : ""}`).join("; ") || "ninguna"}.`,
    `SERIES RECIENTES${dis.machine_slug ? " DE ESE EJERCICIO" : ""}: ${related.map((r: any) => `${r.date} ${name(r.machine_slug)} ${r.unit === "lb" ? `${r.lb} lb` : `${r.kg} kg`} x${r.reps}`).join("; ") || "sin datos"}.`,
    `CATÁLOGO DEL USUARIO: ${(machines || []).map((m: any) => `${m.name} (${m.muscle_group})`).join("; ")}.`,
  ].join("\n");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000 /* incluye el razonamiento previo del modelo */, system: SYSTEM, messages: [{ role: "user", content: context }] }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("anthropic", r.status, t.slice(0, 300));
    return NextResponse.json({ error: "La IA no respondió. Intenta de nuevo en un momento." }, { status: 502 });
  }
  const j = await r.json();
  const advice = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  if (!advice) console.error("anthropic sin texto", MODEL, j.stop_reason, (j.content || []).map((c: any) => c.type).join(","));
  if (!advice) return NextResponse.json({ error: "La IA no devolvió una respuesta." }, { status: 502 });

  await db.from("discomforts").update({ advice, advice_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ advice });
}
