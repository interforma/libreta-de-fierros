"use client";

// Conversación con el entrenador dentro de un ejercicio. Las preguntas rápidas cambian según el momento
// (antes, durante o después del ejercicio) para no tener que escribir con una mano.
// La conversación del día se guarda en sessions.items[<máquina>].chat.

import { useState } from "react";
import { callCoach } from "@/lib/coachClient";
import type { ItemLog } from "@/lib/logic";
import Punto from "@/components/Punto";

export type Turn = { q: string; a: string; at: number; urgent?: boolean };

function quick(it: ItemLog | undefined): string[] {
  const sets = it?.sets || [];
  const done = sets.filter((x) => x.done).length;
  const started = done > 0 || sets.some((x) => (x.tdone || 0) > 0);
  if (sets.length && done === sets.length) return ["¿Qué ajusto para la próxima vez?", "¿Cómo me fue comparado con la vez anterior?"];
  if (started) return ["¿Subo el peso en la siguiente serie?", "Me costó mucho, ¿bajo el peso?", "Sentí una molestia"];
  return ["¿Con qué peso parto hoy?", "La máquina está ocupada, ¿qué hago?", "¿Cómo ajusto la máquina?"];
}

export default function CoachChat({ slug, date, item, target, block, chat, onTurn }: {
  slug: string; date: string; item: ItemLog | undefined; target: string; block: string; chat: Turn[]; onTurn: (t: Turn) => void;
}) {
  const [open, setOpen] = useState(chat.length > 0);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ask(text: string) {
    const t = text.trim(); if (!t || busy) return;
    setBusy(t); setErr(null); setQ("");
    try {
      const j = await callCoach<{ answer: string; urgent?: boolean }>("/api/maquina/pregunta", {
        slug, q: t, date, target, block,
        today: item ? { sets: item.sets, feel: item.feel } : null,
        history: chat.slice(-4).map(({ q, a }) => ({ q, a })),
      });
      onTurn({ q: t, a: j.answer, at: Date.now(), urgent: j.urgent });
    } catch (e: any) {
      setErr(navigator.onLine ? e.message : "Sin señal: el entrenador necesita conexión para responder.");
      setQ(t);
    }
    setBusy(null);
  }

  if (!open) return (
    <button type="button" className="askbtn" onClick={() => setOpen(true)}>
      <Punto expr="atento" size={30} />
      <span><b>Preguntar al entrenador</b><small>Sabe lo que llevas hoy y tus sesiones anteriores</small></span>
    </button>
  );

  return (
    <div className="chat" aria-live="polite">
      <div className="top-row"><span className="who">Tu entrenador</span><button type="button" className="linkbtn" onClick={() => setOpen(false)}>Ocultar</button></div>
      {chat.slice(-6).map((t) => (
        <div key={t.at} className="turn">
          <p className="mq">{t.q}</p>
          <div className={`ma ${t.urgent ? "urgent" : ""}`}><Punto expr={t.urgent ? "uy" : "atento"} size={28} /><p>{t.a}</p></div>
        </div>
      ))}
      {busy && (
        <div className="turn">
          <p className="mq">{busy}</p>
          <div className="ma"><Punto expr="piensa" size={28} alive /><p className="meta">Pensando…</p></div>
        </div>
      )}
      {err && <p className="msg">{err}</p>}
      <div className="chips">{quick(item).map((x) => <button key={x} type="button" disabled={!!busy} onClick={() => ask(x)}>{x}</button>)}</div>
      <form className="askrow" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="note" placeholder={chat.length ? "Sigue preguntando…" : "O escribe o dicta tu duda…"} value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} aria-label="Tu pregunta" />
        <button type="submit" className="suggest" disabled={!!busy || !q.trim()}>Enviar</button>
      </form>
    </div>
  );
}
