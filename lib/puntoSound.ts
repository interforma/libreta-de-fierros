"use client";

// Sonidos de Punto, en la línea de la marca (marimba en re mayor, cálido y corto).
// Respetan el ajuste "Sonido" de Perfil y no suenan si el navegador aún no habilitó el audio.

import { getPrefs } from "@/lib/prefs";

let ctx: AudioContext | null = null;

/** Habilita el audio: llamar dentro de un toque del usuario (iOS lo exige). */
export function unlockPuntoAudio() {
  try { ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)(); ctx.resume?.(); } catch {}
}

function ready(): AudioContext | null {
  if (!getPrefs().sound || !ctx || ctx.state !== "running") return null;
  return ctx;
}

/** Una nota con timbre de marimba: fundamental + parcial alto que se apaga rápido. */
function mallet(a: AudioContext, freq: number, at: number, vol = 0.16) {
  [[1, vol], [4, vol * 0.18]].forEach(([mul, v]) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.value = freq * mul;
    o.connect(g); g.connect(a.destination);
    const t = a.currentTime + at, dur = mul === 1 ? 0.7 : 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  });
}

/** Acorde ascendente de re mayor: sesión terminada. */
export function chime() {
  const a = ready(); if (!a) return;
  [587.33, 739.99, 880, 1174.66].forEach((f, i) => mallet(a, f, i * 0.09, i === 3 ? 0.14 : 0.16));
}

/** "Pop" suave al tocar a Punto. */
export function pop() {
  const a = ready(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = "sine"; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.09);
  o.connect(g); g.connect(a.destination);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.start(t); o.stop(t + 0.18);
  mallet(a, 1174.66, 0.07, 0.07);
}

/** El acorde suena una sola vez por día. */
export function chimeOncePerDay(day: string) {
  try {
    const k = "lf.chime";
    if (localStorage.getItem(k) === day) return;
    if (!ready()) return;
    localStorage.setItem(k, day);
  } catch {}
  chime();
}
