"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callCoach, shrinkPhoto, slugify, uploadMachinePhoto } from "@/lib/coachClient";
import type { Machine } from "@/lib/logic";

/* ---------------- Guía y preguntas dentro de un ejercicio ---------------- */
const QUICK = ["La máquina está ocupada, ¿qué hago?", "¿Cómo ajusto la máquina?", "¿Qué siento si lo hago bien?"];

export function GuidePanel({ machine, onGuide }: { machine: Machine; onGuide: (slug: string, guide: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const [qa, setQa] = useState<{ q: string; a: string; urgent?: boolean }[]>([]);

  async function show() {
    setOpen(true);
    if (machine.guide) return;
    setBusy(true); setErr(null);
    try { const j = await callCoach<{ guide: string }>("/api/maquina/guia", { slug: machine.slug }); onGuide(machine.slug, j.guide); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  async function ask(text: string) {
    const t = text.trim(); if (!t || asking) return;
    setAsking(true); setErr(null);
    try { const j = await callCoach<{ answer: string; urgent?: boolean }>("/api/maquina/pregunta", { slug: machine.slug, q: t }); setQa((x) => [{ q: t, a: j.answer, urgent: j.urgent }, ...x].slice(0, 3)); setQ(""); }
    catch (e: any) { setErr(e.message); }
    setAsking(false);
  }

  if (!open) return <button type="button" className="big ghost" onClick={show}>¿Cómo se hace? Ver guía paso a paso</button>;
  return (
    <div className="guide">
      <div className="top-row"><span className="who">Cómo se hace</span><button type="button" className="linkbtn" onClick={() => setOpen(false)}>Ocultar</button></div>
      {busy ? <p className="meta" style={{ margin: 0 }}>Preparando la guía…</p> : machine.guide ? <div className="gtext">{machine.guide}</div> : null}
      <div className="fld"><span>Pregúntale algo de este ejercicio</span>
        <div className="chips">{QUICK.map((x) => <button key={x} type="button" disabled={asking} onClick={() => ask(x)}>{x}</button>)}</div>
        <form className="askrow" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input className="note" placeholder="O escribe tu duda…" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} aria-label="Tu pregunta" />
          <button type="submit" className="suggest" disabled={asking || !q.trim()}>{asking ? "…" : "Preguntar"}</button>
        </form>
      </div>
      {asking && <p className="meta" style={{ margin: 0 }}>Pensando…</p>}
      {err && <p className="msg">{err}</p>}
      {qa.map((x, i) => (
        <div key={i} className={`qa ${x.urgent ? "urgent" : ""}`}><b>{x.q}</b><p>{x.a}</p></div>
      ))}
    </div>
  );
}

/* ---------------- Foto de una máquina que no conoces ---------------- */
type Seen = { es_maquina: boolean; nombre: string; grupo: string; igual_a: string | null; como_se_usa: string; guia: string; confianza: "alta" | "media" | "baja" };

export function PhotoSheet({ uid, machines, onClose, onSaved }: {
  uid: string; machines: Record<string, Machine>; onClose: () => void; onSaved: (m: Machine, isNew: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; base64: string } | null>(null);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<null | "ver" | "guardar">(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr(null); setSeen(null); setDone(null);
    try {
      const p = await shrinkPhoto(f); setPhoto(p); setPreview(URL.createObjectURL(p.blob));
      setBusy("ver");
      const j = await callCoach<Seen>("/api/maquina/foto", { image: p.base64, media_type: "image/jpeg" });
      setSeen(j); setName(j.nombre);
    } catch (e: any) { setErr(e.message || "No se pudo leer la foto."); }
    setBusy(null);
  }

  async function saveNew() {
    if (!photo || !seen || !name.trim()) return;
    setBusy("guardar"); setErr(null);
    try {
      let slug = slugify(name); let n = 2;
      while (machines[slug]) slug = `${slugify(name)}_${n++}`;
      const photo_path = await uploadMachinePhoto(uid, slug, photo.blob);
      const row = { slug, name: name.trim(), muscle_group: seen.grupo, how_to: seen.como_se_usa, unit: "lb", photo_path, guide: seen.guia || null, guide_at: seen.guia ? new Date().toISOString() : null, source: "foto" };
      const { data, error } = await supabase.from("machines").insert(row).select("slug,name,muscle_group,how_to,unit,settings,photo_path,guide,guide_at,source").single();
      if (error) throw new Error("No se pudo agregar al catálogo.");
      onSaved(data as Machine, true); setDone(`${name.trim()} quedó en tu catálogo, con tu foto y su guía.`);
    } catch (e: any) { setErr(e.message); }
    setBusy(null);
  }
  async function savePhotoTo(slug: string) {
    if (!photo) return;
    setBusy("guardar"); setErr(null);
    try {
      const photo_path = await uploadMachinePhoto(uid, slug, photo.blob);
      const { error } = await supabase.from("machines").update({ photo_path }).eq("slug", slug);
      if (error) throw new Error("No se pudo guardar la foto.");
      onSaved({ ...machines[slug], photo_path }, false); setDone(`Guardé tu foto en ${machines[slug].name}. Desde ahora verás la máquina real de tu gimnasio.`);
    } catch (e: any) { setErr(e.message); }
    setBusy(null);
  }

  const match = seen?.igual_a ? machines[seen.igual_a] : null;
  return (
    <div className="sheet-bg" role="dialog" aria-modal="true" aria-label="Reconocer una máquina" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="top-row"><h2 className="sheet-title">¿Qué máquina es?</h2><button type="button" className="chip-btn" onClick={onClose}>Cerrar</button></div>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
        {!preview && <>
          <p className="how">Sácale una foto a la máquina completa, de lado si puedes. Te digo qué es, cómo se usa y la puedes guardar en tu catálogo.</p>
          <button type="button" className="big" onClick={() => input.current?.click()}>Sacar foto</button>
        </>}
        {preview && <img className="photo" src={preview} alt="Tu foto" />}
        {busy === "ver" && <p className="meta">Mirando la foto…</p>}
        {err && <p className="msg">{err}</p>}
        {seen && !seen.es_maquina && <p className="how">{seen.como_se_usa || "No logré ver una máquina en la foto."}</p>}
        {seen && seen.es_maquina && <>
          <div className="guide">
            <span className="who">{seen.confianza === "baja" ? "Puede ser" : "Máquina identificada"}</span>
            <div className="name" style={{ fontSize: "1.2rem" }}>{seen.nombre}</div>
            <div className="meta" style={{ margin: 0 }}>{seen.grupo}</div>
            <p className="how" style={{ margin: 0 }}>{seen.como_se_usa}</p>
            {seen.guia && <div className="gtext">{seen.guia}</div>}
          </div>
          {!done && (match ? <>
            <p className="how" style={{ margin: 0 }}>Ya la tienes en tu catálogo como <b>{match.name}</b>.</p>
            <button type="button" className="big" disabled={!!busy} onClick={() => savePhotoTo(match.slug)}>{busy === "guardar" ? "Guardando…" : `Usar esta foto en ${match.name}`}</button>
          </> : <>
            <label className="field" style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 700 }}>Nombre en tu catálogo
              <input className="note" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            <button type="button" className="big" disabled={!!busy || !name.trim()} onClick={saveNew}>{busy === "guardar" ? "Guardando…" : "Agregar a mi catálogo"}</button>
          </>)}
        </>}
        {done && <div className="nudge"><b>Listo</b><span>{done}</span></div>}
        {preview && !busy && <button type="button" className="big ghost" onClick={() => { setPreview(null); setPhoto(null); setSeen(null); setDone(null); input.current?.click(); }}>Sacar otra foto</button>}
      </div>
    </div>
  );
}

/* ---------------- Catálogo: máquinas del gimnasio ---------------- */
export function MachineCatalog({ uid, machines, photoUrl, onGuide, onSaved, onAdd }: {
  uid: string; machines: Record<string, Machine>; photoUrl: (m: Machine) => string;
  onGuide: (slug: string, guide: string) => void; onSaved: (m: Machine, isNew: boolean) => void; onAdd: () => void;
}) {
  const list = Object.values(machines).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const own = list.filter((m) => m.photo_path).length;
  const [busy, setBusy] = useState<string | null>(null);
  async function changePhoto(m: Machine, f: File | undefined) {
    if (!f) return;
    setBusy(m.slug);
    try {
      const { blob } = await shrinkPhoto(f);
      const photo_path = await uploadMachinePhoto(uid, m.slug, blob);
      const { error } = await supabase.from("machines").update({ photo_path }).eq("slug", m.slug);
      if (!error) onSaved({ ...m, photo_path }, false);
    } catch {}
    setBusy(null);
  }
  return (
    <>
      <p className="meta" style={{ margin: "6px 2px 0" }}>{list.length} máquinas · {own} con foto de tu gimnasio</p>
      <button type="button" className="big ghost" style={{ marginTop: 10 }} onClick={onAdd}>Agregar una máquina con una foto</button>
      <div className="list">{list.map((m) => (
        <details className="card mcard" key={m.slug}>
          <summary className="head">
            <img className="thumb" src={photoUrl(m)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
            <div><div className="name">{m.name}</div><div className="meta">{m.muscle_group}{m.photo_path ? " · foto propia" : ""}</div></div>
            <span className="meta" aria-hidden="true">▾</span>
          </summary>
          <div className="body">
            <p className="how">{m.how_to}</p>
            <label className="big ghost filebtn">{busy === m.slug ? "Guardando foto…" : m.photo_path ? "Cambiar la foto" : "Poner una foto de mi gimnasio"}
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => changePhoto(m, e.target.files?.[0])} /></label>
            <GuidePanel machine={m} onGuide={onGuide} />
          </div>
        </details>
      ))}</div>
    </>
  );
}
