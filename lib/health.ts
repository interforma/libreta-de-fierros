// Perfil, molestias y señales de alarma. Compartido por la app y la ruta de IA.

export type Supplement = { name: string; dose: string; timing: string; since?: string };
export type Profile = {
  name: string;
  sex: "hombre" | "mujer" | "otro" | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  sport_history: string;
  gym_since: string | null;
  days_per_week: number | null;
  goal: "musculo" | "fuerza" | "salud" | "rendimiento" | "bajar_grasa" | null;
  conditions: string;
  supplements: Supplement[];
  nutrition: string;
  activity: "baja" | "moderada" | "alta" | "muy_alta" | null;
  energy_goal: "deficit" | "recomposicion" | "mantencion" | "superavit" | null;
  kcal_target: number | null;   // indicado por un profesional; reemplaza el cálculo
  protein_target: number | null;
  meal_ai?: MealAi | null;      // última sugerencia de alimentación (la escribe /api/alimentacion)
};
export type MealAi = { mode: "dia" | "revisar"; text: string; at: string; kcal: number; protein: number };
export const EMPTY_PROFILE: Profile = {
  name: "", sex: null, age: null, height_cm: null, weight_kg: null, sport_history: "", gym_since: null,
  days_per_week: null, goal: null, conditions: "", supplements: [], nutrition: "",
  activity: null, energy_goal: null, kcal_target: null, protein_target: null,
};
export const GOALS: [Profile["goal"], string][] = [
  ["musculo", "Ganar músculo"], ["fuerza", "Ganar fuerza"], ["salud", "Salud y movilidad"],
  ["rendimiento", "Rendimiento deportivo"], ["bajar_grasa", "Bajar grasa"],
];

/* ---------------- Balance energético ---------------- */
export const ACTIVITIES: [NonNullable<Profile["activity"]>, string, number][] = [
  ["baja", "Baja (1 a 3 días de ejercicio)", 1.375],
  ["moderada", "Moderada (3 a 5 días)", 1.55],
  ["alta", "Alta (6 a 7 días)", 1.725],
  ["muy_alta", "Muy alta (doble sesión o fondo largo)", 1.9],
];
// [clave, nombre, ajuste de kcal sobre el gasto, g de proteína por kg, explicación]
export const ENERGY_GOALS: [NonNullable<Profile["energy_goal"]>, string, number, number, string][] = [
  ["deficit", "Déficit (bajar grasa)", -400, 2.0, "Bajar grasa sin perder músculo: déficit moderado y proteína alta."],
  ["recomposicion", "Recomposición (bajar grasa y ganar músculo)", -150, 2.0, "Déficit leve con proteína alta y entrenamiento de fuerza: el peso cambia poco, pero cambia la composición."],
  ["mantencion", "Mantención", 0, 1.6, "Comer lo que gastas."],
  ["superavit", "Superávit (ganar músculo)", 250, 1.8, "Superávit leve para ganar músculo con poca grasa."],
];
const r50 = (n: number) => Math.round(n / 50) * 50;
const r5 = (n: number) => Math.round(n / 5) * 5;

/** Actividad elegida, o la que se deduce de los días por semana. */
export function activityOf(p: Pick<Profile, "activity" | "days_per_week">) {
  if (p.activity) return p.activity;
  const d = p.days_per_week;
  if (!d) return null;
  return d >= 6 ? "alta" : d >= 4 ? "moderada" : "baja";
}

/**
 * Metabolismo basal (Mifflin-St Jeor), gasto diario y meta según el objetivo.
 * La meta nunca baja del metabolismo basal. Si hay cifras del nutricionista, mandan esas.
 */
export function energy(p: Profile) {
  if (!p.weight_kg || !p.height_cm || !p.age) return null;
  const sexAdj = p.sex === "hombre" ? 5 : p.sex === "mujer" ? -161 : -78;
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + sexAdj;
  const act = activityOf(p);
  const factor = ACTIVITIES.find((a) => a[0] === act)?.[2] ?? 1.55;
  const tdee = bmr * factor;
  const goal = ENERGY_GOALS.find((g) => g[0] === p.energy_goal) ?? null;
  const calc = goal ? Math.max(bmr, tdee + goal[2]) : null;
  const protein = goal ? r5(p.weight_kg * goal[3]) : r5(p.weight_kg * 1.6);
  return {
    bmr: r50(bmr), tdee: r50(tdee), activity: act, activityGuessed: !p.activity && !!act,
    goal, target: p.kcal_target ?? (calc != null ? r50(calc) : null), targetFromPro: p.kcal_target != null,
    delta: goal ? goal[2] : null, floored: calc != null && p.kcal_target == null && calc === bmr,
    protein: p.protein_target ?? protein, proteinFromPro: p.protein_target != null,
  };
}

export type Discomfort = {
  id: string;
  date: string;
  area: string;
  side: "izquierda" | "derecha" | "ambos" | "centro" | null;
  intensity: number;
  moment: "durante" | "despues" | "reposo" | null;
  machine_slug: string | null;
  note: string;
  resolved: boolean;
  advice: string | null;
  advice_at: string | null;
};
export const AREAS = ["Hombro", "Codo", "Muñeca", "Cuello", "Espalda alta", "Espalda baja", "Cadera", "Rodilla", "Tobillo", "Pie", "Pecho", "Otra"];
export const MOMENTS: [Discomfort["moment"], string][] = [["durante", "Durante el ejercicio"], ["despues", "Después"], ["reposo", "En reposo"]];

export const bmi = (p: Profile) => (p.height_cm && p.weight_kg ? p.weight_kg / (p.height_cm / 100) ** 2 : null);
export const monthsSince = (d: string | null) => {
  if (!d) return null;
  const a = new Date(d + "T12:00:00"), b = new Date();
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth());
};

/* Señales de alarma: se revisan antes de cualquier IA y no dependen de ella. */
const URGENT_WORDS = /pecho|falta de aire|ahog|mareo|desmay|palpitaci|hormigu|adormec|entumec|visi[oó]n borrosa|n[aá]usea|sudor fr[ií]o/i;
export function redFlag(d: Pick<Discomfort, "area" | "intensity" | "moment" | "note">) {
  if (d.area === "Pecho" || URGENT_WORDS.test(d.note || "")) {
    return {
      level: "urgent" as const,
      title: "Detén el entrenamiento ahora",
      text: "Dolor u opresión en el pecho, falta de aire, mareo, palpitaciones o adormecimiento pueden ser una emergencia. Para, siéntate y pide ayuda. Si no cede en pocos minutos o es intenso, llama al 131 (SAMU) o ve a urgencias. No es algo para resolver con la app.",
    };
  }
  if (d.intensity >= 7 || d.moment === "reposo") {
    return {
      level: "stop" as const,
      title: "No sigas cargando esa zona hoy",
      text: d.intensity >= 7
        ? "Un dolor de 7 o más es señal para detener el ejercicio. Si fue súbito, con chasquido, hinchazón o pérdida de fuerza, consulta con un médico o kinesiólogo antes de volver a entrenarla."
        : "Un dolor que aparece en reposo merece revisión profesional, sobre todo si dura más de unos días o te despierta en la noche.",
    };
  }
  return null;
}
