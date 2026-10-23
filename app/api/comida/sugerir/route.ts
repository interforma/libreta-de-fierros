import { NextResponse } from "next/server";
import { askClaude, CoachError, MODEL_FAST, profileLines, userDb } from "@/lib/coach";
import { energy, EMPTY_PROFILE, type Profile } from "@/lib/health";

// "¿Qué como ahora?": lo que falta del día se calcula aquí con lo anotado; Claude solo propone la próxima comida,
// de preferencia con los alimentos y recetas habituales de la persona.

const SYSTEM = `Eres el entrenador de "Libreta de Fierros", una app de gimnasio. Propones la PRÓXIMA comida para acercarse a la meta del día. No eres nutricionista.
Reglas:
- Usa las cifras que te da la app (lo comido y lo que falta); no calcules otra meta.
- Prefiere los alimentos y recetas habituales de la persona, con sus cifras. Si faltan frutas o verduras, inclúyelas.
- Ajusta a la hora: no propongas un almuerzo a las 21:00. Si ya está cerca o sobre la meta, dilo con calma y propone algo liviano o nada.
- Nunca reclames ni culpes: un día bajo la meta no importa, pesa el promedio semanal.
- Respeta indicaciones de nutricionista y condiciones del perfil. Sin suplementos nuevos.
- Español de Chile, directo. Texto plano sin markdown. Máximo 55 palabras: qué comer (con porción), ~kcal y g de proteína, y en qué queda el día.`;

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { date, hour } = await req.json().catch(() => ({}));
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });

  const [{ data: p }, { data: meals }, { data: foods }] = await Promise.all([
    db.from("profiles").select("*").maybeSingle(),
    db.from("meals").select("slot,name,qty,kcal,protein_g,collagen_g,fruit_veg").eq("date", date).order("at"),
    db.from("foods").select("name,portion,kcal,protein_g,fruit_veg").order("uses", { ascending: false }).limit(25),
  ]);
  const prof = { ...EMPTY_PROFILE, ...(p || {}) } as Profile;
  const e = energy(prof);
  if (!e || e.target == null) return NextResponse.json({ error: "Completa tu perfil y elige un objetivo de calorías." }, { status: 400 });
  if (prof.age != null && prof.age < 18) return NextResponse.json({ error: "Para menores de 18 años, la alimentación la debe orientar un nutricionista o médico." }, { status: 422 });

  const sum = (k: string) => (meals || []).reduce((a: number, m: any) => a + Number(m[k] || 0), 0);
  const kcal = Math.round(sum("kcal")), prot = Math.round(sum("protein_g")), col = Math.round(sum("collagen_g")), fv = sum("fruit_veg");
  const h = Number.isFinite(Number(hour)) ? Math.max(0, Math.min(23, Number(hour))) : 13;

  const context = [
    profileLines(prof),
    `HORA: ${h}:00.`,
    `META DEL DÍA: ${e.target} kcal y ${e.protein} g de proteína. Frutas y verduras: 5 porciones.`,
    `LO COMIDO HOY: ${(meals || []).map((m: any) => `${m.slot}: ${m.name}${Number(m.qty) !== 1 ? ` ×${m.qty}` : ""} (${Math.round(m.kcal)} kcal, ${Math.round(m.protein_g)} g)`).join("; ") || "nada anotado aún"}.`,
    `TOTAL: ${kcal} kcal, ${prot} g de proteína${col ? ` (${col} g son colágeno)` : ""}, ${fv} de 5 porciones de fruta y verdura.`,
    `FALTA: ${Math.max(0, e.target - kcal)} kcal y ${Math.max(0, e.protein - prot)} g de proteína.`,
    `HABITUALES: ${(foods || []).map((f: any) => `${f.name} (${f.portion}: ${Math.round(f.kcal)} kcal, ${Number(f.protein_g)} g)`).join("; ") || "ninguno"}.`,
  ].join("\n");

  try {
    const text = await askClaude({ model: MODEL_FAST, system: SYSTEM, content: context, maxTokens: 500 });
    return NextResponse.json({ text, at: new Date().toISOString() });
  } catch (err) {
    const c = err instanceof CoachError ? err : new CoachError("No se pudo preparar la sugerencia.", 500);
    return NextResponse.json({ error: c.message }, { status: c.status });
  }
}
