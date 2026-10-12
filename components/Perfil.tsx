"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AREAS, GOALS, MOMENTS, bmi, monthsSince, redFlag, type Discomfort, type Profile, type Supplement } from "@/lib/health";
import { fmtNum, parseNum, shortDate, type Machine } from "@/lib/logic";

/* ---------------- Perfil ---------------- */
export function ProfileCard({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [p, setP] = useState<Profile>(profile);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!edit) setP(profile); }, [profile, edit]);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const months = monthsSince(profile.gym_since);
  const b = bmi(profile);

  if (!edit) {
    const row = (k: string, v: React.ReactNode) => v ? <div className="kv"><span>{k}</span><span>{v}</span></div> : null;
    return (
      <section className="card pcard">
        <div className="pcard-head">
          <div><div className="name">{profile.name || "Tu perfil"}</div>
            <div className="meta">{[profile.sex, profile.age && `${profile.age} años`].filter(Boolean).join(" · ") || "Completa tus datos"}</div></div>
          <button type="button" className="chip-btn" onClick={() => setEdit(true)}>Editar</button>
        </div>
        <div className="stats" style={{ marginTop: 0 }}>
          <div className="stat"><div className="v">{profile.height_cm ? (profile.height_cm / 100).toFixed(2).replace(".", ",") : "—"}</div><div className="k">metros</div></div>
          <div className="stat"><div className="v">{profile.weight_kg ? fmtNum(profile.weight_kg) : "—"}</div><div className="k">kg de peso</div></div>
          <div className="stat"><div className="v">{b ? fmtNum(Math.round(b * 10) / 10) : "—"}</div><div className="k">IMC</div></div>
        </div>
        <div className="kvs">
          {row("Trayectoria", profile.sport_history)}
          {row("En el gimnasio", months != null ? `${months} ${months === 1 ? "mes" : "meses"}${profile.days_per_week ? ` · ${profile.days_per_week} días por semana` : ""}` : null)}
          {row("Objetivo", GOALS.find((g) => g[0] === profile.goal)?.[1])}
          {row("Lesiones o condiciones", profile.conditions)}
        </div>
        {profile.supplements.length > 0 && <>
          <h3 className="sub">Suplementos</h3>
          {profile.supplements.map((s, i) => (
            <div className="supl" key={i}><b>{s.name}</b><span>{s.dose}{s.timing ? ` · ${s.timing}` : ""}{s.since ? ` · desde ${shortDate(s.since)}` : ""}</span></div>
          ))}
        </>}
        {profile.nutrition && <><h3 className="sub">Alimentación</h3><p className="how" style={{ whiteSpace: "pre-wrap" }}>{profile.nutrition}</p></>}
      </section>
    );
  }

  const num = (k: "age" | "height_cm" | "weight_kg" | "days_per_week", label: string) => (
    <label className="field">{label}<input id={`pf-${k}`} inputMode="decimal" value={p[k] == null ? "" : fmtNum(p[k] as number)}
      onChange={(e) => set(k, parseNum(e.target.value) as any)} /></label>
  );
  const updSupl = (i: number, patch: Partial<Supplement>) => set("supplements", p.supplements.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <form className="card pcard form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(p); setBusy(false); setEdit(false); }}>
      <label className="field">Nombre<input id="pf-name" value={p.name} onChange={(e) => set("name", e.target.value)} /></label>
      <div className="grid2">
        <label className="field">Sexo<select id="pf-sex" value={p.sex || ""} onChange={(e) => set("sex", (e.target.value || null) as any)}>
          <option value="">—</option><option value="hombre">Hombre</option><option value="mujer">Mujer</option><option value="otro">Otro</option></select></label>
        {num("age", "Edad")}
        {num("height_cm", "Estatura (cm)")}
        {num("weight_kg", "Peso (kg)")}
        <label className="field">En gimnasio desde<input id="pf-since" type="date" value={p.gym_since || ""} onChange={(e) => set("gym_since", e.target.value || null)} /></label>
        {num("days_per_week", "Días por semana")}
      </div>
      <label className="field">Objetivo<select id="pf-goal" value={p.goal || ""} onChange={(e) => set("goal", (e.target.value || null) as any)}>
        <option value="">—</option>{GOALS.map(([k, l]) => <option key={k} value={k!}>{l}</option>)}</select></label>
      <label className="field">Trayectoria deportiva<textarea id="pf-history" rows={2} value={p.sport_history} onChange={(e) => set("sport_history", e.target.value)} /></label>
      <label className="field">Lesiones o condiciones a considerar<textarea id="pf-cond" rows={2} placeholder="Ej.: operado de menisco derecho en 2019" value={p.conditions} onChange={(e) => set("conditions", e.target.value)} /></label>
      <h3 className="sub">Suplementos</h3>
      {p.supplements.map((s, i) => (
        <div className="supl-edit" key={i}>
          <input id={`pf-s${i}-name`} placeholder="Nombre" value={s.name} onChange={(e) => updSupl(i, { name: e.target.value })} />
          <input id={`pf-s${i}-dose`} placeholder="Dosis" value={s.dose} onChange={(e) => updSupl(i, { dose: e.target.value })} />
          <input id={`pf-s${i}-timing`} placeholder="Cuándo" value={s.timing} onChange={(e) => updSupl(i, { timing: e.target.value })} />
          <button type="button" className="linkbtn" onClick={() => set("supplements", p.supplements.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button type="button" className="linkbtn" onClick={() => set("supplements", [...p.supplements, { name: "", dose: "", timing: "", since: new Date().toISOString().slice(0, 10) }])}>+ Agregar suplemento</button>
      <label className="field">Alimentación<textarea id="pf-food" rows={4} value={p.nutrition} onChange={(e) => set("nutrition", e.target.value)} /></label>
      <div className="grid2">
        <button type="button" className="big ghost" onClick={() => { setP(profile); setEdit(false); }}>Cancelar</button>
        <button type="submit" className="big" disabled={busy}>{busy ? "Guardando…" : "Guardar perfil"}</button>
      </div>
    </form>
  );
}

/* ---------------- Reportar molestia ---------------- */
export function DiscomfortSheet({ machines, options, initialMachine, onClose, onSaved }: {
  machines: Record<string, Machine>; options: string[]; initialMachine: string | null;
  onClose: () => void; onSaved: (d: Discomfort) => void;
}) {
  const [area, setArea] = useState<string>("");
  const [side, setSide] = useState<Discomfort["side"]>(null);
  const [intensity, setIntensity] = useState(4);
  const [moment, setMoment] = useState<Discomfort["moment"]>("durante");
  const [machine, setMachine] = useState<string>(initialMachine || "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flag = area ? redFlag({ area, intensity, moment, note }) : null;

  async function save() {
    if (!area) { setErr("Elige la zona donde sientes la molestia."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from("discomforts")
      .insert({ area, side, intensity, moment, machine_slug: machine || null, note: note.slice(0, 500), date: new Date().toLocaleDateString("en-CA") })
      .select().single();
    setBusy(false);
    if (error) { setErr("No se pudo guardar. Revisa tu conexión e intenta de nuevo."); return; }
    onSaved(data as Discomfort);
  }

  return (
    <div className="sheet-bg" role="dialog" aria-modal="true" aria-label="Reportar molestia" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="top-row"><h2 className="sheet-title">Reportar molestia</h2><button type="button" className="chip-btn" onClick={onClose}>Cerrar</button></div>
        <div className="field">Zona
          <div className="chips">{AREAS.map((a) => <button key={a} type="button" className={area === a ? "on" : ""} onClick={() => setArea(a)}>{a}</button>)}</div>
        </div>
        <div className="field">Lado
          <div className="chips">{(["izquierda", "derecha", "ambos", "centro"] as const).map((s) => <button key={s} type="button" className={side === s ? "on" : ""} onClick={() => setSide(side === s ? null : s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div>
        </div>
        <div className="field"><span>Intensidad · {intensity} de 10</span>
          <div className="step" style={{ marginTop: 6 }}>
            <button type="button" aria-label="Menos" onClick={() => setIntensity(Math.max(1, intensity - 1))}>−</button>
            <div className="unit"><span className="num" style={{ fontSize: 24, fontWeight: 600 }}>{intensity}</span><small>{intensity <= 3 ? "leve" : intensity <= 6 ? "moderada" : "fuerte"}</small></div>
            <button type="button" aria-label="Más" onClick={() => setIntensity(Math.min(10, intensity + 1))}>+</button>
          </div>
        </div>
        <div className="field">Cuándo
          <div className="chips">{MOMENTS.map(([k, l]) => <button key={k} type="button" className={moment === k ? "on" : ""} onClick={() => setMoment(k)}>{l}</button>)}</div>
        </div>
        <label className="field">Ejercicio relacionado
          <select id="ds-machine" value={machine} onChange={(e) => setMachine(e.target.value)}>
            <option value="">Ninguno en particular</option>
            {options.map((m) => <option key={m} value={m}>{machines[m]?.name || m}</option>)}
          </select>
        </label>
        <label className="field">Cómo es (opcional)
          <textarea id="ds-note" rows={2} placeholder="Ej.: pinchazo al bajar la barra, punzante, desde la semana pasada" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {flag && <div className={`alert ${flag.level}`}><b>{flag.title}</b><span>{flag.text}</span></div>}
        {err && <p className="msg">{err}</p>}
        <button type="button" className="big" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar molestia"}</button>
      </div>
    </div>
  );
}

/* ---------------- Lista de molestias ---------------- */
export function DiscomfortList({ items, machines, onChange }: { items: Discomfort[]; machines: Record<string, Machine>; onChange: (d: Discomfort) => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});

  async function ask(d: Discomfort) {
    setBusyId(d.id); setErr((e) => ({ ...e, [d.id]: "" }));
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/orientacion", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ id: d.id }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "No se pudo obtener la orientación.");
      onChange({ ...d, advice: j.advice, advice_at: new Date().toISOString() });
    } catch (e: any) { setErr((x) => ({ ...x, [d.id]: e.message })); }
    setBusyId(null);
  }
  async function resolve(d: Discomfort) {
    const { error } = await supabase.from("discomforts").update({ resolved: !d.resolved }).eq("id", d.id);
    if (!error) onChange({ ...d, resolved: !d.resolved });
  }

  if (!items.length) return <div className="empty">Sin molestias registradas. Si algo te duele durante o después de entrenar, regístralo con el botón de arriba: así queda historial y puedes pedir orientación.</div>;
  return (
    <div className="list">{items.map((d) => {
      const flag = redFlag(d);
      return (
        <section className={`card dcard ${d.resolved ? "resolved" : ""}`} key={d.id}>
          <div className="dhead">
            <span className={`sev s${d.intensity >= 7 ? 3 : d.intensity >= 4 ? 2 : 1}`}>{d.intensity}</span>
            <div><div className="name">{d.area}{d.side ? ` · ${d.side}` : ""}</div>
              <div className="meta">{shortDate(d.date)}{d.moment ? ` · ${MOMENTS.find((m) => m[0] === d.moment)?.[1].toLowerCase()}` : ""}{d.machine_slug ? ` · ${machines[d.machine_slug]?.name || d.machine_slug}` : ""}</div></div>
            <span className="meta">{d.resolved ? "Resuelta" : "Activa"}</span>
          </div>
          {d.note && <p className="how">{d.note}</p>}
          {flag && !d.resolved && <div className={`alert ${flag.level}`}><b>{flag.title}</b><span>{flag.text}</span></div>}
          {d.advice && <div className="advice"><div className="eyebrow">Orientación</div><p>{d.advice}</p></div>}
          {err[d.id] && <p className="msg">{err[d.id]}</p>}
          <div className="grid2">
            {flag?.level !== "urgent" && !d.resolved && <button type="button" className="big ghost" disabled={busyId === d.id} onClick={() => ask(d)}>{busyId === d.id ? "Pensando…" : d.advice ? "Actualizar orientación" : "Pedir orientación"}</button>}
            <button type="button" className="big ghost" onClick={() => resolve(d)}>{d.resolved ? "Reabrir" : "Marcar como resuelta"}</button>
          </div>
        </section>
      );
    })}</div>
  );
}
