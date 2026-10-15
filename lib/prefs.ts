// Ajustes de lectura y avisos. Se guardan en el teléfono (no en Supabase): dependen del aparato y de la vista de cada uno.

export type TextSize = "normal" | "grande" | "muy";
export type Theme = "light" | "dark" | "auto";
export type Prefs = { size: TextSize; theme: Theme; sound: boolean; vibrate: boolean };

export const DEFAULT_PREFS: Prefs = { size: "normal", theme: "light", sound: true, vibrate: true };
const KEY = "lf.prefs";

export function getPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Prefs>) }; }
  catch { return DEFAULT_PREFS; }
}

export function applyPrefs(p: Prefs) {
  const h = document.documentElement;
  if (p.size === "normal") delete h.dataset.size; else h.dataset.size = p.size;
  if (p.theme === "auto") h.removeAttribute("data-theme"); else h.dataset.theme = p.theme;
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  applyPrefs(p);
}

export const SIZES: [TextSize, string][] = [["normal", "Normal"], ["grande", "Grande"], ["muy", "Muy grande"]];
export const THEMES: [Theme, string][] = [["light", "Claro"], ["dark", "Oscuro"], ["auto", "Automático"]];
