import { NextResponse } from "next/server";
import { askClaude, CoachError, MODEL_DEEP, MODEL_FAST, profileLines, userDb, wText, type SetRow } from "@/lib/coach";
import { blockEnd, keyOf, parseKey, type Block } from "@/lib/logic";

// Balance de un bloque de entrenamiento: qué avanzó, qué conviene cuidar y qué proponer para el siguiente.

const SYSTEM = `Eres el entrenador de "Libreta de Fierros", una app personal de gimnasio. Haces el balance de un bloque de entrenamiento que termina.
Escribe en español de Chile, tuteando, tono directo y cercano, en texto plano (sin markdown, sin asteriscos, sin emojis). Máximo 170 palabras.
Usa exactamente estas tres partes, cada una con su título y dos puntos en su propia línea:
Lo que avanzó: 2 o 3 logros concretos con sus cifras tal como aparecen en los datos.
Lo que conviene cuidar: 1 o 2 cosas (ejercicios estancados, sesiones que faltaron, molestias). Si no hay nada relevante, dilo en una frase.
Para el próximo bloque: 2 o 3 propuestas concretas y alcanzables, coherentes con el enfoque del próximo bloque si viene indicado.
No inventes cifras ni ejercicios que no estén abajo, no des consejos médicos y no contradigas las indicaciones de sus profesionales.`;

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { block_id } = await req.json().catch(() => ({}));
  if (!block_id || typeof block_id !== "string") return NextResponse.json({ error: "Falta el bloque." }, { status: 400 });

  const { data: blocks } = await db.from("blocks").select("id,name,start_date,weeks,deload_week,focus").order("start_date");
  const bl = (blocks || []).find((b: any) => b.id === block_id) as Block | undefined;
  if (!bl) return NextResponse.json({ error: "No encontré ese bloque." }, { status: 404 });
  const next = (blocks || []).find((b: any) => b.start_date > bl.start_date) as Block | undefined;
  const end = blockEnd(bl), today = keyOf(new Date()), until = end < today ? end : today;

  const [{ data: p }, { data: machines }, { data: routines }, { data: rows }, { data: sessions }, { data: dis }, { data: checks }] = await Promise.all([
    db.from("profiles").select("*").maybeSingle(),
    db.from("machines").select("slug,name,unit"),
    db.from("routines").select("slug,name,weekdays,block_id,items"),
    db.from("set_log").select("date,machine_slug,unit,kg,lb,reps,secs,done,feel").gte("date", bl.start_date).lte("date", until).eq("done", true).order("date").limit(5000),
    db.from("sessions").select("date,items").gte("date", bl.start_date).lte("date", until),
    db.from("discomforts").select("date,area,side,intensity,resolved").gte("date", bl.start_date).lte("date", until),
    db.from("checkups").select("date,kind,weight_kg,muscle_kg,body_fat_pct,notes").gte("date", bl.start_date).lte("date", until).order("date"),
  ]);

  // sesiones hechas vs planificadas
  const plannedDays = new Set<number>();
  (routines || []).filter((r: any) => r.block_id === bl.id).forEach((r: any) => r.weekdays.forEach((d: number) => plannedDays.add(d)));
  const doneSessions = (sessions || []).filter((s: any) => Object.entries(s.items || {}).some(([k, it]: [string, any]) => !k.startsWith("__") && (it?.done || it?.sets?.some((x: any) => x.done))));
  const done = doneSessions.length;
  // Las sesiones planificadas se cuentan desde el primer registro: antes de eso la persona entrenaba sin la app
  // y esos días no son "sesiones que faltaron".
  const firstLog = doneSessions.map((s: any) => s.date as string).sort()[0];
  const from = firstLog && firstLog > bl.start_date ? firstLog : bl.start_date;
  let planned = 0;
  for (let d = parseKey(from); keyOf(d) <= until; d.setDate(d.getDate() + 1)) if (plannedDays.has(d.getDay())) planned++;

  // progreso por ejercicio: mejor kg de la primera y de la última sesión del bloque
  const all = (rows || []) as SetRow[];
  const name = (m: string) => (machines || []).find((x: any) => x.slug === m)?.name || m;
  const unitOf = (m: string) => ((machines || []).find((x: any) => x.slug === m)?.unit === "kg" ? "kg" : "lb") as "kg" | "lb";
  const byM: Record<string, Record<string, SetRow[]>> = {};
  all.filter((r) => r.kg != null).forEach((r) => { ((byM[r.machine_slug] ||= {})[r.date] ||= []).push(r); });
  const prog: string[] = [];
  for (const [m, days] of Object.entries(byM)) {
    const ds = Object.keys(days).sort();
    const top = (d: string) => days[d].reduce((a, r) => (Number(r.kg) > Number(a.kg) ? r : a), days[d][0]);
    const a = top(ds[0]), b = top(ds[ds.length - 1]);
    const pct = Number(a.kg) ? Math.round(((Number(b.kg) - Number(a.kg)) / Number(a.kg)) * 100) : 0;
    const u = unitOf(m);
    prog.push(`${name(m)}: ${ds.length} sesiones; de ${wText(Number(a.kg), a.lb != null ? Number(a.lb) : null, u)} a ${wText(Number(b.kg), b.lb != null ? Number(b.lb) : null, u)} (${pct >= 0 ? "+" : ""}${pct} %).`);
  }
  const feels = all.reduce<Record<string, number>>((acc, r) => { if (r.feel) acc[r.feel] = (acc[r.feel] || 0) + 1; return acc; }, {});

  const context = [
    profileLines((p || {}) as any),
    `BLOQUE: ${bl.name}, del ${bl.start_date} al ${end} (${bl.weeks} semanas). Enfoque: ${bl.focus || "no indicado"}. Datos hasta ${until}.`,
    from > bl.start_date
      ? `SESIONES: ${done} hechas de ${planned} planificadas desde el ${from}, cuando empezó a registrar en la app. Antes de esa fecha entrenaba igual, pero sin registro aquí: no lo trates como sesiones que faltaron.`
      : `SESIONES: ${done} hechas de ${planned} planificadas.`,
    `PROGRESO POR EJERCICIO (mejor serie, primera vs última sesión del bloque):`,
    ...(prog.length ? prog : ["sin series con peso registradas"]),
    Object.keys(feels).length ? `SENSACIÓN MARCADA EN SERIES: ${Object.entries(feels).map(([k, v]) => `${k} ${v}`).join(", ")}.` : "",
    (dis || []).length ? `MOLESTIAS EN EL BLOQUE: ${(dis || []).map((d: any) => `${d.date} ${d.area}${d.side ? " " + d.side : ""} ${d.intensity}/10${d.resolved ? " (resuelta)" : " (activa)"}`).join("; ")}.` : "MOLESTIAS EN EL BLOQUE: ninguna.",
    (checks || []).length ? `CONTROLES: ${(checks || []).map((c: any) => `${c.date} ${c.kind}${c.weight_kg != null ? ` peso ${c.weight_kg} kg` : ""}${c.muscle_kg != null ? ` masa muscular ${c.muscle_kg} kg` : ""}${c.notes ? `. Indicaciones: ${String(c.notes).slice(0, 200)}` : ""}`).join(" | ")}` : "",
    next ? `PRÓXIMO BLOQUE: ${next.name}, desde ${next.start_date}, ${next.weeks} semanas${next.deload_week ? `, descarga en semana ${next.deload_week}` : ""}. Enfoque: ${next.focus || "no indicado"}.` : "PRÓXIMO BLOQUE: aún no está planificado.",
  ].filter(Boolean).join("\n");

  try {
    const text = await askClaude({ model: MODEL_DEEP, system: SYSTEM, content: context, maxTokens: 700 });
    // Sugerencias por ejercicio del próximo bloque, sacadas del mismo texto que lee la persona,
    // para mostrarlas en la tarjeta del ejercicio el día que le toque.
    const tips = next ? await tipsFor(text, (routines || []).filter((r: any) => r.block_id === next.id), name).catch(() => ({})) : {};
    const balance = { text, done, planned, at: new Date().toISOString(), tips };
    await db.from("blocks").update({ balance }).eq("id", bl.id);
    return NextResponse.json(balance);
  } catch (e) {
    const err = e as CoachError;
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

const TIPS_SYSTEM = `Lees el balance de un bloque de gimnasio y la lista de ejercicios del bloque siguiente.
Devuelve SOLO un objeto JSON {"<slug>": "<sugerencia>"} con los ejercicios de la lista a los que el balance les da una indicación concreta (subir peso, rango de repeticiones, técnica, variante, ir liviano).
Cada sugerencia: una frase corta en español de Chile, tuteando, máximo 16 palabras, que diga qué hacer hoy en ese ejercicio. No inventes nada que el balance no diga. Una indicación general (por ejemplo "ejercicios grandes") aplícala solo a los ejercicios que claramente corresponden. Si ninguno aplica, devuelve {}.`;

async function tipsFor(text: string, nextRoutines: any[], name: (m: string) => string): Promise<Record<string, string>> {
  const slugs = Array.from(new Set(nextRoutines.flatMap((r) => (r.items || []).map((x: any) => x.m as string)).filter(Boolean)));
  if (!slugs.length) return {};
  const list = slugs.map((s) => {
    const def = nextRoutines.flatMap((r) => r.items || []).find((x: any) => x.m === s);
    return `${s}: ${def?.label || name(s)}${def?.reps ? ` (${def.reps[0]}–${def.reps[1]} reps)` : ""}`;
  }).join("\n");
  const raw = await askClaude({ model: MODEL_FAST, system: TIPS_SYSTEM, content: `BALANCE:\n${text}\n\nEJERCICIOS DEL BLOQUE SIGUIENTE:\n${list}`, maxTokens: 600 });
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return {};
  const obj = JSON.parse(m[0]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (slugs.includes(k) && typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 160);
  return out;
}
