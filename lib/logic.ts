// Lógica pura de la libreta: fechas, unidades, rutinas y precarga de pesos.

export type Unit = "lb" | "kg";
export type Kind = "load" | "hold" | "cardio";

export type Machine = {
  slug: string;
  name: string;
  muscle_group: string;
  how_to: string;
  unit: Unit;
  settings: string;
  photo_path: string | null;
};

export type ItemDef = {
  m: string;
  k: Kind;
  sets?: number;
  reps?: [number, number];
  secs?: number;
  min?: number;
  rest?: number;
  label?: string;
  alt?: string;
  per?: string;
};

export type Routine = {
  slug: string;
  name: string;
  type: "fuerza" | "cardio";
  weekdays: number[];
  duration_min: number | null;
  items: ItemDef[];
  position: number;
};

export type SetLog = { kg?: number | null; lb?: number | null; reps?: number | null; secs?: number | null; done: boolean };
export type ItemLog = { unit?: Unit; sets?: SetLog[]; min?: number | null; done?: boolean; feel?: string | null; note?: string };
export type Session = { date: string; routine_slug: string | null; items: Record<string, ItemLog>; client_updated_at: number };

/* fechas */
export const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const shortDate = (k: string) => { const d = parseKey(k); return `${DAYS[d.getDay()].slice(0, 3).toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
export const mmss = (s: number) => `${Math.floor(s / 60)}:${pad(Math.max(0, Math.floor(s % 60)))}`;

/* números y unidades */
export const fmtNum = (v: number | null | undefined) => (v == null || (v as any) === "" ? "" : (Math.round(v * 10) / 10).toString().replace(".", ","));
export const parseNum = (s: string) => { const v = parseFloat(String(s).replace(",", ".")); return isFinite(v) ? v : null; };
const LB = 0.45359237;
export const toKg = (lb: number | null | undefined) => (lb == null ? null : Math.round(lb * LB * 10) / 10);
export const toLb = (kg: number | null | undefined) => (kg == null ? null : Math.round((kg / LB) * 10) / 10);
export const unitOf = (it?: ItemLog): Unit => it?.unit || "kg";
export const wIn = (st: SetLog, u: Unit) => (u === "lb" ? st.lb ?? toLb(st.kg) : st.kg ?? null);
export function setW(st: SetLog, u: Unit, v: number | null) {
  if (u === "lb") { st.lb = v; st.kg = toKg(v); } else { st.kg = v; st.lb = toLb(v); }
}
export const fmtW = (kg: number | null | undefined, lb: number | null | undefined, u: Unit) =>
  u === "lb"
    ? `${fmtNum(lb ?? toLb(kg))} lb (${fmtNum(kg ?? toKg(lb))} kg)`
    : `${fmtNum(kg ?? toKg(lb))} kg (${fmtNum(lb ?? toLb(kg))} lb)`;

/* rutina y sesiones */
export function routineForDay(routines: Routine[], date: Date) {
  return routines.find((r) => r.weekdays.includes(date.getDay())) || null;
}
export function lastFor(sessions: Record<string, Session>, m: string, beforeKey: string) {
  const ks = Object.keys(sessions).filter((k) => k < beforeKey).sort().reverse();
  for (const k of ks) {
    const it = sessions[k].items?.[m];
    if (it && (it.sets?.some((x) => x.done) || it.done)) return { date: k, it };
  }
  return null;
}
export function freshItem(def: ItemDef, sessions: Record<string, Session>, machine: Machine | undefined, todayKey: string): ItemLog {
  if (def.k === "cardio") return { min: def.min ?? null, done: false };
  const last = lastFor(sessions, def.m, todayKey);
  const sets: SetLog[] = [];
  for (let i = 0; i < (def.sets || 3); i++) {
    const p = last?.it.sets?.[i] || last?.it.sets?.[last.it.sets.length - 1];
    if (def.k === "hold") sets.push({ secs: p?.secs ?? def.secs ?? 30, done: false });
    else sets.push({ kg: p?.kg ?? null, lb: p?.lb ?? toLb(p?.kg ?? null), reps: p?.reps ?? def.reps?.[0] ?? 10, done: false });
  }
  if (def.k === "hold") return { sets, feel: null, note: "" };
  return { unit: machine?.unit || (last ? unitOf(last.it) : "lb"), sets, feel: null, note: "" };
}
export function itemDone(def: ItemDef, it?: ItemLog) {
  if (!it) return false;
  if (def.k === "cardio") return !!it.done;
  return !!it.sets?.length && it.sets.every((x) => x.done);
}
export function targetText(def: ItemDef) {
  if (def.k === "cardio") return `${def.min} min · ${def.alt || ""}`;
  if (def.k === "hold") return `${def.sets} × ${def.secs} s${def.per ? " " + def.per : ""} · desc. ${mmss(def.rest || 60)}`;
  const r = def.reps![0] === def.reps![1] ? `${def.reps![0]}` : `${def.reps![0]}–${def.reps![1]}`;
  return `${def.sets} × ${r}${def.per ? " " + def.per : ""} · desc. ${mmss(def.rest || 90)}`;
}
export const FEELS: [string, string][] = [["facil", "Fácil"], ["justo", "Justo"], ["dificil", "Difícil"]];
export const feelName = (f?: string | null) => (FEELS.find((x) => x[0] === f) || [, ""])[1];

export const FOOD: Record<string, [string, string][]> = {
  fuerza: [["07:00", "500 ml de agua al levantarte"], ["07:30", "Avena con leche, plátano y 2 huevos (o pan integral con huevos y fruta)"], ["08:45", "250 ml de agua"], ["Durante", "150–250 ml cada 15–20 min (unos 750 ml)"], ["10:30", "Barra PFN o yogur proteico + fruta, y 500 ml de agua"], ["13:00", "Almuerzo: proteína + arroz, papa o quinoa + verduras"]],
  cardio: [["07:00", "500 ml de agua al levantarte"], ["07:45", "Yogur griego + fruta + un puñado de avena o frutos secos"], ["Durante", "150–200 ml cada 15–20 min (unos 500 ml)"], ["10:00", "Leche o yogur + fruta, y 500 ml de agua"], ["13:00", "Almuerzo: proteína + arroz, papa o quinoa + verduras"]],
};

/* progreso: mejor serie de cada sesión (en kg, la unidad interna) */
export function metricOf(it?: ItemLog) {
  if (!it) return null;
  if (it.sets) {
    const ds = it.sets.filter((x) => x.done);
    if (!ds.length) return null;
    if (ds[0].secs != null) return { v: Math.max(...ds.map((x) => x.secs || 0)), u: "s" as const };
    const best = ds.reduce<SetLog | null>((a, x) => ((x.kg || 0) > (a?.kg || 0) ? x : a), null);
    return best && best.kg
      ? { v: best.kg, lb: best.lb, unit: unitOf(it), u: "kg" as const, reps: ds.map((x) => x.reps) }
      : { v: Math.max(...ds.map((x) => x.reps || 0)), u: "reps" as const };
  }
  if (it.done) return { v: it.min || 0, u: "min" as const };
  return null;
}
