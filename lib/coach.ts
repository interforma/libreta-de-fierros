// Apoyo del "entrenador" con Claude: solo en el servidor (rutas de /api).
// Los números se calculan aquí y se le pasan a Claude ya resueltos, para que el texto se apoye en hechos y no invente cifras.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bmi, energy, monthsSince, GOALS, EMPTY_PROFILE, type Profile } from "@/lib/health";
import { fmtNum, toKg, toLb, type Unit } from "@/lib/logic";

export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-5-5";
export const MODEL_DEEP = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

/** Cliente con el token del usuario: Supabase aplica RLS, así que solo ve sus propios datos. */
export function userDb(req: Request): SupabaseClient | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

// Ojo: los modelos Claude 5.5 piensan antes de responder (thinking adaptativo por defecto) y ese
// razonamiento cuenta dentro de max_tokens. Con un límite chico no queda espacio para el texto,
// así que el largo de la respuesta se controla en el prompt y max_tokens lleva holgura.
const MIN_TOKENS = 4000;
type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
export async function askClaude(opts: { model: string; system: string; content: string | Block[]; maxTokens: number }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new CoachError("La IA aún no está activada (falta la clave de la API de Claude en Vercel).", 503);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: opts.model, max_tokens: Math.max(opts.maxTokens, MIN_TOKENS), system: opts.system, messages: [{ role: "user", content: opts.content }] }),
  });
  if (!r.ok) {
    console.error("anthropic", r.status, (await r.text()).slice(0, 300));
    throw new CoachError("La IA no respondió. Intenta de nuevo en un momento.", 502);
  }
  const j = await r.json();
  const text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  if (!text) {
    console.error("anthropic sin texto", opts.model, j.stop_reason, (j.content || []).map((c: any) => c.type).join(","));
    throw new CoachError("La IA no devolvió una respuesta. Intenta de nuevo.", 502);
  }
  return text;
}

export class CoachError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function profileLines(prof: Partial<Profile>) {
  const b = prof.height_cm && prof.weight_kg ? bmi(prof as Profile) : null;
  return [
    `PERFIL: ${prof.sex || "sexo no indicado"}, ${prof.age ?? "?"} años, ${prof.weight_kg ?? "?"} kg${b ? ` (IMC ${b.toFixed(1)})` : ""}. ${prof.days_per_week ?? "?"} días por semana, hace ${monthsSince(prof.gym_since ?? null) ?? "?"} meses en el gimnasio.`,
    `Trayectoria: ${prof.sport_history || "no indicada"}. Objetivo: ${GOALS.find((g) => g[0] === prof.goal)?.[1] || "no indicado"}. Condiciones: ${prof.conditions || "ninguna indicada"}.`,
    energyLine(prof),
  ].filter(Boolean).join("\n");
}

function energyLine(prof: Partial<Profile>) {
  const e = energy({ ...EMPTY_PROFILE, ...prof } as Profile);
  if (!e || !e.goal) return "";
  return `ENERGÍA: objetivo ${e.goal[1].toLowerCase()}. Meta ${e.target} kcal/día${e.targetFromPro ? " (indicada por su nutricionista)" : ` (cálculo: gasto estimado ${e.tdee} kcal)`}, proteína ${e.protein} g/día${e.proteinFromPro ? " (indicada por su nutricionista)" : ""}. Son estimaciones; no las cambies ni des otras cifras.`;
}

/** Peso en la unidad de la máquina, con la equivalencia. */
export function wText(kg: number | null, lb: number | null, unit: Unit) {
  if (unit === "lb") return `${fmtNum(lb ?? toLb(kg))} lb (${fmtNum(kg ?? toKg(lb))} kg)`;
  return `${fmtNum(kg ?? toKg(lb))} kg`;
}

export type SetRow = { date: string; machine_slug: string; unit: string; kg: number | null; lb: number | null; reps: number | null; secs: number | null; done: boolean; feel: string | null; tandas?: number | null };

/** Mejor serie (más kg) de un ejercicio en una fecha, con todas sus repeticiones. */
export function bestOf(rows: SetRow[]) {
  const done = rows.filter((r) => r.done);
  if (!done.length) return null;
  const top = done.reduce((a, r) => (Number(r.kg || 0) > Number(a.kg || 0) ? r : a), done[0]);
  return { kg: top.kg != null ? Number(top.kg) : null, lb: top.lb != null ? Number(top.lb) : null, unit: (top.unit === "lb" ? "lb" : "kg") as Unit, reps: done.map((r) => r.reps ?? 0), tandas: done.map((r) => Number(r.tandas) || 1), feel: top.feel };
}

/** Repeticiones de un día para el texto del entrenador: "10×3, 15×3, 10" (×3 = tres tandas con ese peso). */
export function repsLine(b: { reps: number[]; tandas?: number[] }) {
  return b.reps.map((r, i) => ((b.tandas?.[i] || 1) > 1 ? `${r}×${b.tandas![i]}` : `${r}`)).join(", ");
}
export const TANDAS_NOTE = `Formato de repeticiones: "10×3" significa 3 tandas de 10 repeticiones con el mismo peso dentro de una misma serie (entrena en pirámide). Las repeticiones que se comparan con el rango son las de cada tanda.`;
