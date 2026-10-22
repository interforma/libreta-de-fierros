// Lógica pura de la libreta: fechas, unidades, rutinas y precarga de pesos.

export type Unit = "lb" | "kg";
export type Kind = "load" | "hold" | "cardio";

export type Machine = {
  slug: string;
  name: string;
  muscle_group: string;
  how_to: string;
  alternative?: string | null; // qué hacer si está ocupada o no se entiende
  unit: Unit;
  settings: string;
  photo_path: string | null;
  guide?: string | null;     // guía paso a paso generada con Claude
  guide_at?: string | null;
  source?: "catalogo" | "foto";
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
  note?: string;
};

export type Routine = {
  slug: string;
  name: string;
  type: "fuerza" | "cardio";
  weekdays: number[];
  duration_min: number | null;
  items: ItemDef[];
  position: number;
  block_id?: string | null;
};

export type Block = {
  id: string;
  name: string;
  start_date: string;
  weeks: number;
  deload_week: number | null;
  focus: string;
  /** Balance al cerrar el bloque; tips = sugerencia por ejercicio para el bloque siguiente. */
  balance?: { text: string; done: number; planned: number; at: string; tips?: Record<string, string> } | null;
};

/** Una serie. Con pirámide, cada serie puede tener varias tandas con el mismo peso:
 *  reps = repeticiones por tanda, tandas = cuántas veces se repite, tdone = tandas ya hechas. */
export type SetLog = { kg?: number | null; lb?: number | null; reps?: number | null; secs?: number | null; tandas?: number | null; tdone?: number; done: boolean };
export type ItemLog = { unit?: Unit; sets?: SetLog[]; min?: number | null; done?: boolean; feel?: string | null; note?: string; tip_seen?: boolean; photos?: string[]; chat?: { q: string; a: string; at: number; urgent?: boolean }[] };
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

/* bloques: el activo es el último que ya empezó */
export function activeBlock(blocks: Block[], key: string) {
  return [...blocks].filter((b) => b.start_date <= key).sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] || null;
}
export function weekOf(b: Block, key: string) {
  const days = Math.round((parseKey(key).getTime() - parseKey(b.start_date).getTime()) / 864e5);
  return Math.floor(days / 7) + 1;
}
export function blockEnd(b: Block) {
  const d = parseKey(b.start_date); d.setDate(d.getDate() + b.weeks * 7 - 1); return keyOf(d);
}
export const isDeload = (blocks: Block[], key: string) => {
  const b = activeBlock(blocks, key);
  return !!b && b.deload_week != null && weekOf(b, key) === b.deload_week;
};
export const routinesOf = (routines: Routine[], blockId: string | null | undefined) =>
  routines.filter((r) => !blockId || r.block_id === blockId);

/* rutina y sesiones */
export function routineForDay(routines: Routine[], date: Date, blocks: Block[] = []) {
  const b = activeBlock(blocks, keyOf(date));
  return routinesOf(routines, b?.id).find((r) => r.weekdays.includes(date.getDay())) || null;
}
export function lastFor(sessions: Record<string, Session>, m: string, beforeKey: string, skip?: (k: string) => boolean) {
  const ks = Object.keys(sessions).filter((k) => k < beforeKey && !skip?.(k)).sort().reverse();
  for (const k of ks) {
    const it = sessions[k].items?.[m];
    if (it && (it.sets?.some((x) => x.done) || it.done)) return { date: k, it };
  }
  return null;
}
const roundTo = (v: number, step: number) => Math.round(v / step) * step;
// Precarga desde la última sesión normal (las de descarga no cuentan).
// En semana de descarga: una serie menos (mínimo 2) y ~60 % del peso.
// Al empezar un bloque nuevo, las repeticiones parten del mínimo del nuevo rango.
export function freshItem(def: ItemDef, sessions: Record<string, Session>, machine: Machine | undefined, todayKey: string, blocks: Block[] = []): ItemLog {
  if (def.k === "cardio") return { min: def.min ?? null, done: false };
  const deload = isDeload(blocks, todayKey);
  const block = activeBlock(blocks, todayKey);
  const last = lastFor(sessions, def.m, todayKey, (k) => isDeload(blocks, k));
  const newBlock = !!block && !!last && last.date < block.start_date;
  const n = deload ? Math.max(2, (def.sets || 3) - 1) : def.sets || 3;
  const unit: Unit = machine?.unit || (last ? unitOf(last.it) : "lb");
  const sets: SetLog[] = [];
  for (let i = 0; i < n; i++) {
    const p = last?.it.sets?.[i] || last?.it.sets?.[last.it.sets.length - 1];
    if (def.k === "hold") { sets.push({ secs: p?.secs ?? def.secs ?? 30, done: false }); continue; }
    const st: SetLog = { kg: p?.kg ?? null, lb: p?.lb ?? toLb(p?.kg ?? null), reps: newBlock ? def.reps?.[0] ?? 10 : p?.reps ?? def.reps?.[0] ?? 10, done: false };
    if (p?.tandas && p.tandas > 1) st.tandas = p.tandas;
    // registros antiguos con las tandas sumadas (ej. 30 reps en una serie): partir del rango del plan
    else if (!newBlock && (p?.reps ?? 0) > (def.reps?.[1] ?? 12) * 1.6) st.reps = def.reps?.[0] ?? 10;
    if (deload && (st.kg || st.lb)) {
      const w = wIn(st, unit)!;
      setW(st, unit, roundTo(w * 0.6, unit === "lb" ? 5 : 2.5) || (unit === "lb" ? 5 : 2.5));
    }
    sets.push(st);
  }
  if (def.k === "hold") return { sets, feel: null, note: "" };
  return { unit, sets, feel: null, note: "" };
}
export function itemDone(def: ItemDef, it?: ItemLog) {
  if (!it) return false;
  if (def.k === "cardio") return !!it.done;
  return !!it.sets?.length && it.sets.every((x) => x.done);
}
export function targetText(def: ItemDef) {
  if (def.k === "cardio") return `${def.min} min · ${def.alt || ""}`;
  if (def.k === "hold") return `${def.sets} series de ${def.secs} s${def.per ? " " + def.per : ""} · descanso ${mmss(def.rest || 60)}`;
  const r = def.reps![0] === def.reps![1] ? `${def.reps![0]}` : `${def.reps![0]} a ${def.reps![1]}`;
  return `${def.sets} series de ${r} reps${def.per ? " " + def.per : ""} · descanso ${mmss(def.rest || 90)}`;
}
export const FEELS: [string, string][] = [["facil", "Fácil"], ["justo", "Justo"], ["dificil", "Difícil"]];
export const feelName = (f?: string | null) => (FEELS.find((x) => x[0] === f) || [, ""])[1];

export const FOOD: Record<string, [string, string][]> = {
  fuerza: [["07:00", "500 ml de agua al levantarte"], ["07:30", "Avena con leche, plátano y 2 huevos (o pan integral con huevos y fruta)"], ["08:45", "250 ml de agua"], ["Durante", "150–250 ml cada 15–20 min (unos 750 ml)"], ["10:30", "Barra PFN o yogur proteico + fruta, y 500 ml de agua"], ["13:00", "Almuerzo: proteína + arroz, papa o quinoa + verduras"]],
  cardio: [["07:00", "500 ml de agua al levantarte"], ["07:45", "Yogur griego + fruta + un puñado de avena o frutos secos"], ["Durante", "150–200 ml cada 15–20 min (unos 500 ml)"], ["10:00", "Leche o yogur + fruta, y 500 ml de agua"], ["13:00", "Almuerzo: proteína + arroz, papa o quinoa + verduras"]],
};

/* progreso: mejor serie de cada sesión (en kg, la unidad interna) */
/** Repeticiones de una serie para mostrar: "10" o "10×3" si fueron tandas. */
export const repsOf = (x: SetLog) => (x.tandas && x.tandas > 1 ? `${x.reps ?? "?"}×${x.tandas}` : `${x.reps ?? "?"}`);
export function metricOf(it?: ItemLog) {
  if (!it) return null;
  if (it.sets) {
    const ds = it.sets.filter((x) => x.done);
    if (!ds.length) return null;
    if (ds[0].secs != null) return { v: Math.max(...ds.map((x) => x.secs || 0)), u: "s" as const };
    const best = ds.reduce<SetLog | null>((a, x) => ((x.kg || 0) > (a?.kg || 0) ? x : a), null);
    return best && best.kg
      ? { v: best.kg, lb: best.lb, unit: unitOf(it), u: "kg" as const, reps: ds.map(repsOf) }
      : { v: Math.max(...ds.map((x) => x.reps || 0)), u: "reps" as const };
  }
  if (it.done) return { v: it.min || 0, u: "min" as const };
  return null;
}

/** "Fuerza base: grandes a 8–10, pequeños a 12–15. Semana 4 de descarga." → título y puntos cortos.
 *  La descarga se omite porque ya se ve en la barra de semanas. */
export function focusParts(focus: string | null | undefined): { title: string; points: string[] } {
  const f = (focus || "").trim();
  if (!f) return { title: "", points: [] };
  const i = f.indexOf(":");
  const title = i > 0 && i < 40 ? f.slice(0, i).trim() : "";
  const body = i > 0 && i < 40 ? f.slice(i + 1) : f;
  const points = body.split(/\.\s+|\.$/).map((x) => x.trim()).filter((x) => x && !/descarga/i.test(x))
    .flatMap((x) => x.split(/,\s*/)).map((x) => x.trim()).filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1));
  return { title, points: points.slice(0, 4) };
}
