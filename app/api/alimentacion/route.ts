import { NextResponse } from "next/server";
import { askClaude, CoachError, MODEL_DEEP, profileLines, userDb } from "@/lib/coach";
import { energy, EMPTY_PROFILE, type Profile } from "@/lib/health";

// Alimentación con el entrenador. Las calorías y la proteína se calculan aquí (lib/health.ts);
// Claude solo arma el ejemplo de comidas o revisa el plan escrito, ajustándose a esas cifras.

const BASE = `Eres el entrenador de "Libreta de Fierros", una app de gimnasio. Ayudas con la alimentación de forma práctica, no eres nutricionista.
Reglas fijas:
- Usa EXACTAMENTE la meta de kcal y proteína que te da la app; no calcules otras ni propongas comer menos de esa meta.
- Si hay indicaciones de un nutricionista, mandan ellas: respétalas y no las contradigas.
- Respeta las condiciones del perfil (alergias, intolerancias, lo que no come). Si el plan escrito dice que no come algo, no lo incluyas.
- Comida chilena común, de supermercado o feria, con porciones caseras (taza, cucharada, unidad) y gramos solo cuando ayuda.
- Nada de dietas extremas, ayunos largos, productos milagro ni suplementos nuevos. No hables de medicamentos.
- Español de Chile, tono directo y cercano. Texto plano, sin markdown ni asteriscos.`;

const DIA = `${BASE}
Arma UN día de ejemplo que sume la meta (±100 kcal) y llegue a la proteína. Formato, cada parte en su línea, con su título y dos puntos:
Desayuno: …  (~kcal · g proteína)
Almuerzo: …  (~kcal · g proteína)
Once: …  (~kcal · g proteína)
Cena: …  (~kcal · g proteína)
Colación: … (solo si hace falta para llegar)
Total: ~kcal · g proteína
Consejo: una frase sobre cómo repartir la proteína o qué comer cerca del entrenamiento.
Máximo 150 palabras.`;

const REVISAR = `${BASE}
Revisa el plan de alimentación que escribió la persona contra su meta. Estima sus kcal y proteína aproximadas y di si está cerca, corto o pasado. Formato, cada parte en su línea:
Tu plan hoy: ~kcal · g proteína (estimado)
Comparado con tu meta: una frase.
Ajustes: 1 a 3 cambios concretos y fáciles (qué agregar, quitar o cambiar de porción).
Si el plan es demasiado vago para estimar, dilo y pide qué detallar. Máximo 130 palabras.`;

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { mode = "dia", previous } = await req.json().catch(() => ({}));
  if (mode !== "dia" && mode !== "revisar") return NextResponse.json({ error: "Opción no válida." }, { status: 400 });

  const [{ data: p }, { data: checks }] = await Promise.all([
    db.from("profiles").select("*").maybeSingle(),
    db.from("checkups").select("date,kind,weight_kg,notes").order("date", { ascending: false }).limit(3),
  ]);
  const prof = { ...EMPTY_PROFILE, ...(p || {}) } as Profile;
  const e = energy(prof);
  if (!e || e.target == null) return NextResponse.json({ error: "Completa edad, estatura y peso, y elige un objetivo de calorías." }, { status: 400 });
  if (prof.age != null && prof.age < 18) return NextResponse.json({ error: "Para menores de 18 años, la alimentación la debe orientar un nutricionista o médico." }, { status: 422 });
  if (mode === "revisar" && prof.nutrition.trim().length < 20) return NextResponse.json({ error: "Primero escribe tu plan de alimentación en el perfil (lo que comes en un día normal)." }, { status: 400 });

  const pro = (checks || []).filter((c: any) => c.notes && c.kind === "nutricionista");
  const context = [
    profileLines(prof),
    `META DE LA APP: ${e.target} kcal/día y ${e.protein} g de proteína/día${e.targetFromPro ? " (indicadas por su nutricionista)" : ""}.`,
    pro.length ? `INDICACIONES DEL NUTRICIONISTA: ${pro.map((c: any) => `${c.date}: ${String(c.notes).slice(0, 400)}`).join(" | ")}` : "",
    `SUPLEMENTOS: ${prof.supplements.map((s) => `${s.name} ${s.dose}`).join("; ") || "ninguno"}.`,
    `PLAN DE ALIMENTACIÓN ESCRITO POR LA PERSONA: ${prof.nutrition.slice(0, 1500) || "(no escribió)"}`,
    mode === "dia" && typeof previous === "string" && previous ? `YA LE SUGERISTE ESTO; ahora propone un día distinto:\n${previous.slice(0, 800)}` : "",
  ].filter(Boolean).join("\n");

  try {
    const text = await askClaude({ model: MODEL_DEEP, system: mode === "dia" ? DIA : REVISAR, content: context, maxTokens: 900 });
    const meal_ai = { mode, text, at: new Date().toISOString(), kcal: e.target, protein: e.protein };
    await db.from("profiles").update({ meal_ai }).eq("user_id", (p as any)?.user_id);
    return NextResponse.json(meal_ai);
  } catch (err) {
    const c = err instanceof CoachError ? err : new CoachError("No se pudo preparar la sugerencia.", 500);
    return NextResponse.json({ error: c.message }, { status: c.status });
  }
}
