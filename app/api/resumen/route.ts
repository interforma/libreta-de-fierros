import { NextResponse } from "next/server";
import { askClaude, bestOf, CoachError, MODEL_FAST, profileLines, userDb, wText, type SetRow } from "@/lib/coach";
import { feelName } from "@/lib/logic";

// Comentario corto al terminar la sesión: un logro concreto y una propuesta para la próxima vez.

const SYSTEM = `Eres el entrenador de "Libreta de Fierros", una app personal de gimnasio. El usuario acaba de terminar su sesión.
Escribe un comentario de cierre en español de Chile, tuteando, tono directo y cálido, en texto plano (sin markdown, sin emojis, sin signos de exclamación seguidos).
Máximo 3 frases y 60 palabras en total:
1. Un logro concreto sacado de los DATOS, con la cifra tal como aparece (no la redondees ni la conviertas).
2. Una sola propuesta para la próxima sesión de esta rutina: subir peso donde completó el tope de repeticiones sin que le costara, mantener donde costó, o cuidar una zona con molestia activa.
Si es la primera vez que registra un ejercicio, el logro puede ser haber fijado su peso de partida.
No inventes datos que no estén abajo, no felicites de forma genérica, no des consejos médicos.`;

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { date } = await req.json().catch(() => ({}));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Falta la fecha." }, { status: 400 });

  const [{ data: sess }, { data: p }, { data: machines }, { data: routines }, { data: rows }, { data: dis }] = await Promise.all([
    db.from("sessions").select("date,routine_slug,items").eq("date", date).maybeSingle(),
    db.from("profiles").select("*").maybeSingle(),
    db.from("machines").select("slug,name,unit"),
    db.from("routines").select("slug,name,items"),
    db.from("set_log").select("date,machine_slug,unit,kg,lb,reps,secs,done,feel").lte("date", date).eq("done", true).order("date", { ascending: false }).limit(400),
    db.from("discomforts").select("area,side,intensity,machine_slug").eq("resolved", false).limit(5),
  ]);
  if (!sess) return NextResponse.json({ error: "No encontré la sesión de hoy guardada. Revisa la conexión e intenta de nuevo." }, { status: 404 });

  const name = (m: string) => (machines || []).find((x: any) => x.slug === m)?.name || m;
  const unitOf = (m: string) => ((machines || []).find((x: any) => x.slug === m)?.unit === "kg" ? "kg" : "lb") as "kg" | "lb";
  const routine = (routines || []).find((r: any) => r.slug === sess.routine_slug);
  const items: Record<string, any> = sess.items || {};
  const all = (rows || []) as SetRow[];

  const lines: string[] = [];
  for (const [m, it] of Object.entries(items)) {
    if (m.startsWith("__")) continue;
    if (!it?.sets) { if (it?.done) lines.push(`${name(m)}: ${it.min ?? "?"} min de cardio.`); continue; }
    const today = bestOf(all.filter((r) => r.machine_slug === m && r.date === date));
    if (!today) continue;
    const u = unitOf(m);
    const prevDate = all.find((r) => r.machine_slug === m && r.date < date)?.date;
    const prev = prevDate ? bestOf(all.filter((r) => r.machine_slug === m && r.date === prevDate)) : null;
    const isHold = all.some((r) => r.machine_slug === m && r.date === date && r.secs != null);
    const def = routine?.items?.find((d: any) => d.m === m);
    const top = def?.reps?.[1];
    const cur = isHold ? "series en segundos" : today.kg ? `${wText(today.kg, today.lb, u)} × ${today.reps.join(", ")} reps` : `${today.reps.join(", ")} reps`;
    let cmp = "primera vez que lo registra";
    if (prev && !isHold) {
      const d = Number(today.kg || 0) - Number(prev.kg || 0);
      cmp = `la vez anterior (${prevDate}): ${prev.kg ? wText(prev.kg, prev.lb, u) : ""} × ${prev.reps.join(", ")}` + (d > 0.05 ? " → subió de peso" : d < -0.05 ? " → bajó de peso" : " → mismo peso");
    }
    const feel = it.feel ? `, sensación: ${feelName(it.feel)}` : "";
    const topHit = top && !isHold && today.reps.length && today.reps.every((r) => r >= top) ? `, completó el tope de ${top} reps en todas las series` : "";
    lines.push(`${name(m)}: hoy ${cur}${topHit}${feel}; ${cmp}.`);
  }
  if (!lines.length) return NextResponse.json({ error: "Aún no hay series marcadas en la sesión de hoy." }, { status: 422 });

  const t0 = Number(items.__t0) || 0, t1 = Number(items.__t1) || 0;
  const mins = t0 && t1 && t1 > t0 ? Math.round((t1 - t0) / 60000) : null;
  const context = [
    profileLines((p || {}) as any),
    `RUTINA DE HOY: ${routine?.name || sess.routine_slug || "sin rutina"}${mins ? `, duración aproximada ${mins} min` : ""}.`,
    (dis || []).length ? `MOLESTIAS ACTIVAS: ${(dis || []).map((d: any) => `${d.area}${d.side ? " " + d.side : ""} ${d.intensity}/10${d.machine_slug ? ` (en ${name(d.machine_slug)})` : ""}`).join("; ")}.` : "",
    `DATOS DE LA SESIÓN:`,
    ...lines,
  ].filter(Boolean).join("\n");

  try {
    const text = await askClaude({ model: MODEL_FAST, system: SYSTEM, content: context, maxTokens: 220 });
    return NextResponse.json({ text });
  } catch (e) {
    const err = e as CoachError;
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
