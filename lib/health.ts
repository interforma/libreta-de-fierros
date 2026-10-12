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
};
export const EMPTY_PROFILE: Profile = {
  name: "", sex: null, age: null, height_cm: null, weight_kg: null, sport_history: "", gym_since: null,
  days_per_week: null, goal: null, conditions: "", supplements: [], nutrition: "",
};
export const GOALS: [Profile["goal"], string][] = [
  ["musculo", "Ganar músculo"], ["fuerza", "Ganar fuerza"], ["salud", "Salud y movilidad"],
  ["rendimiento", "Rendimiento deportivo"], ["bajar_grasa", "Bajar grasa"],
];

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
