"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITIES, AREAS, ENERGY_GOALS, GOALS, MOMENTS, activityOf, bmi, energy, monthsSince, redFlag, type Discomfort, type Profile, type Supplement } from "@/lib/health";
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
        <EnergyBlock profile={profile} onEdit={() => setEdit(true)} />
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
          <button type="button" className="linkbtn danger" onClick={() => set("supplements", p.supplements.filter((_, j) => j !== i))}>Quitar</button>
        </div>
      ))}
      <button type="button" className="linkbtn" onClick={() => set("supplements", [...p.supplements, { name: "", dose: "", timing: "", since: new Date().toISOString().slice(0, 10) }])}>+ Agregar suplemento</button>
      <h3 className="sub">Energía diaria</h3>
      <label className="field">Nivel de actividad<select id="pf-activity" value={p.activity || ""} onChange={(e) => set("activity", (e.target.value || null) as any)}>
        <option value="">Según días por semana{activityOf({ ...p, activity: null }) ? ` (${ACTIVITIES.find((a) => a[0] === activityOf({ ...p, activity: null }))?.[1].split(" (")[0].toLowerCase()})` : ""}</option>
        {ACTIVITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div className="field">Objetivo de calorías
        <div className="chips">{ENERGY_GOALS.map(([k, l]) => <button key={k} type="button" className={p.energy_goal === k ? "on" : ""} onClick={() => set("energy_goal", p.energy_goal === k ? null : k)}>{l.split(" (")[0]}</button>)}</div>
        {p.energy_goal && <span className="meta">{ENERGY_GOALS.find((g) => g[0] === p.energy_goal)?.[4]}</span>}
      </div>
      <div className="grid2">
        <label className="field">kcal indicadas por tu nutricionista<input id="pf-kcal" inputMode="numeric" placeholder="Opcional" value={p.kcal_target ?? ""} onChange={(e) => set("kcal_target", parseNum(e.target.value) ? Math.round(parseNum(e.target.value)!) : null)} /></label>
        <label className="field">Proteína indicada (g/día)<input id="pf-prot" inputMode="numeric" placeholder="Opcional" value={p.protein_target ?? ""} onChange={(e) => set("protein_target", parseNum(e.target.value) ? Math.round(parseNum(e.target.value)!) : null)} /></label>
      </div>
      <label className="field">Alimentación<textarea id="pf-food" rows={4} value={p.nutrition} onChange={(e) => set("nutrition", e.target.value)} /></label>
      <div className="grid2">
        <button type="button" className="big ghost" onClick={() => { setP(profile); setEdit(false); }}>Cancelar</button>
        <button type="submit" className="big" disabled={busy}>{busy ? "Guardando…" : "Guardar perfil"}</button>
      </div>
    </form>
  );
}

/* ---------------- Energía diaria ---------------- */
function EnergyBlock({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const e = energy(profile);
  if (!e) return null;
  const n = (x: number) => x.toLocaleString("es-CL");
  if (!e.goal && !e.targetFromPro) return (
    <>
      <h3 className="sub">Energía diaria</h3>
      <p className="how">Gastas cerca de <b>{n(e.tdee)} kcal</b> al día. Elige un objetivo de calorías para ver tu meta.</p>
      <button type="button" className="linkbtn" onClick={onEdit}>Elegir objetivo</button>
    </>
  );
  return (
    <>
      <h3 className="sub">Energía diaria{e.goal ? ` · ${e.goal[1].split(" (")[0].toLowerCase()}` : ""}</h3>
      <div className="stats" style={{ marginTop: 0 }}>
        <div className="stat"><div className="v num">{n(e.target!)}</div><div className="k">kcal meta</div></div>
        <div className="stat"><div className="v num">{e.protein}</div><div className="k">g proteína</div></div>
        <div className="stat"><div className="v num">{n(e.tdee)}</div><div className="k">kcal gasto</div></div>
      </div>
      <p className="meta">
        {e.targetFromPro ? "Meta indicada por tu nutricionista. " : `Gasto estimado ${e.delta! > 0 ? "+" : e.delta! < 0 ? "−" : "±"} ${Math.abs(e.delta!)} kcal${e.floored ? " (ajustada para no bajar de tu metabolismo basal)" : ""}. `}
        Basal {n(e.bmr)} kcal · actividad {ACTIVITIES.find((a) => a[0] === e.activity)?.[1].split(" (")[0].toLowerCase() || "moderada"}{e.activityGuessed ? " (según tus días por semana)" : ""}.
        {" "}Es una estimación: si en 3 a 4 semanas el peso o las medidas no van en la dirección que buscas, ajusta ±150 kcal o consulta en tu próximo control.
      </p>
    </>
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

/* ---------------- Controles con profesionales ---------------- */
export type Checkup = {
  id: string; date: string; kind: "nutricionista" | "kinesiologo" | "medico" | "entrenador" | "otro"; professional: string;
  weight_kg: number | null; body_fat_pct: number | null; muscle_kg: number | null; waist_cm: number | null;
  notes: string; next_date: string | null;
};
export const KINDS: [Checkup["kind"], string][] = [["nutricionista", "Nutricionista"], ["kinesiologo", "Kinesiólogo"], ["medico", "Médico"], ["entrenador", "Entrenador"], ["otro", "Otro"]];
const METRICS: [keyof Checkup, string, string][] = [["weight_kg", "Peso", "kg"], ["body_fat_pct", "Grasa", "%"], ["muscle_kg", "Masa muscular", "kg"], ["waist_cm", "Cintura", "cm"]];
const todayIso = () => new Date().toLocaleDateString("en-CA");
const blank = (): Omit<Checkup, "id"> => ({ date: todayIso(), kind: "nutricionista", professional: "", weight_kg: null, body_fat_pct: null, muscle_kg: null, waist_cm: null, notes: "", next_date: null });

function CheckupForm({ initial, onCancel, onSaved }: { initial: Partial<Checkup>; onCancel: () => void; onSaved: (c: Checkup) => void }) {
  const [c, setC] = useState({ ...blank(), ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Checkup, v: any) => setC((x) => ({ ...x, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const { id, ...row } = c as any;
    const q = id ? supabase.from("checkups").update(row).eq("id", id) : supabase.from("checkups").insert(row);
    const { data, error } = await q.select().single();
    setBusy(false);
    if (error) { setErr("No se pudo guardar. Revisa tu conexión e intenta de nuevo."); return; }
    onSaved(data as Checkup);
  }
  return (
    <form className="card pcard form" onSubmit={save}>
      <div className="grid2">
        <label className="field">Fecha<input id="ck-date" type="date" required value={c.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className="field">Con<select id="ck-kind" value={c.kind} onChange={(e) => set("kind", e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <label className="field">Profesional (opcional)<input id="ck-pro" placeholder="Nombre o lugar" value={c.professional} onChange={(e) => set("professional", e.target.value)} /></label>
      <div className="grid2">
        {METRICS.map(([k, l, u]) => (
          <label className="field" key={k}>{l} ({u})<input id={`ck-${k}`} inputMode="decimal" value={c[k] == null ? "" : fmtNum(c[k] as number)} onChange={(e) => set(k, parseNum(e.target.value))} /></label>
        ))}
      </div>
      <label className="field">Indicaciones recibidas<textarea id="ck-notes" rows={4} placeholder="Ej.: subir proteína a 1,6 g/kg, agregar colación después de entrenar" value={c.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      <label className="field">Próximo control (opcional)<input id="ck-next" type="date" value={c.next_date || ""} onChange={(e) => set("next_date", e.target.value || null)} /></label>
      {err && <p className="msg">{err}</p>}
      <div className="grid2">
        <button type="button" className="big ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="big" disabled={busy}>{busy ? "Guardando…" : "Guardar control"}</button>
      </div>
    </form>
  );
}

export function CheckupList({ items, onSaved, onDeleted }: { items: Checkup[]; onSaved: (c: Checkup) => void; onDeleted: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null); // "new" o id
  const today = todayIso();
  const next = items.map((x) => x.next_date).filter((d): d is string => !!d && d >= today).sort()[0];
  const kindName = (k: string) => KINDS.find((x) => x[0] === k)?.[1] || k;
  // evolución: primer y último valor de cada medida (orden cronológico)
  const evo = METRICS.map(([k, l, u]) => {
    const pts = items.filter((x) => x[k] != null).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (pts.length < 2) return null;
    const a = Number(pts[0][k]), b = Number(pts[pts.length - 1][k]), d = Math.round((b - a) * 10) / 10;
    return { l, u, a, b, d, from: pts[0].date };
  }).filter(Boolean) as { l: string; u: string; a: number; b: number; d: number; from: string }[];

  async function del(c: Checkup) {
    if (!confirm(`¿Borrar el control del ${shortDate(c.date)}?`)) return;
    const { error } = await supabase.from("checkups").delete().eq("id", c.id);
    if (!error) onDeleted(c.id);
  }

  return (
    <>
      {next && <div className="alert warn" style={{ marginTop: 10 }}><b>Próximo control: {shortDate(next)}</b><span>Lleva anotado cómo te has sentido y tus pesos de trabajo; la app te los muestra en Progreso.</span></div>}
      {editing === "new"
        ? <div className="list"><CheckupForm initial={{}} onCancel={() => setEditing(null)} onSaved={(c) => { onSaved(c); setEditing(null); }} /></div>
        : <button type="button" className="big ghost" style={{ marginTop: 10 }} onClick={() => setEditing("new")}>Registrar un control</button>}
      {evo.length > 0 && (
        <section className="card pcard" style={{ marginTop: 10 }}>
          <h3 className="sub" style={{ marginTop: 0 }}>Evolución desde {shortDate(evo[0].from)}</h3>
          <div className="kvs">{evo.map((e) => (
            <div className="kv" key={e.l}><span>{e.l}</span><span className="num">{fmtNum(e.a)} → {fmtNum(e.b)} {e.u} <b className={e.d === 0 ? "" : "delta"}>({e.d > 0 ? "+" : ""}{fmtNum(e.d)})</b></span></div>
          ))}</div>
        </section>
      )}
      {!items.length && editing !== "new" && <div className="empty">Sin controles todavía. Cuando vayas al nutricionista u otro profesional, anota aquí las medidas y lo que te indicó: queda el historial y la orientación con IA lo toma en cuenta.</div>}
      <div className="list">{items.map((c) => editing === c.id
        ? <CheckupForm key={c.id} initial={c} onCancel={() => setEditing(null)} onSaved={(x) => { onSaved(x); setEditing(null); }} />
        : (
          <section className="card pcard" key={c.id}>
            <div className="pcard-head">
              <div><div className="name">{kindName(c.kind)}{c.professional ? ` · ${c.professional}` : ""}</div><div className="meta">{shortDate(c.date)}{c.next_date ? ` · próximo ${shortDate(c.next_date)}` : ""}</div></div>
              <button type="button" className="chip-btn" onClick={() => setEditing(c.id)}>Editar</button>
            </div>
            {METRICS.some(([k]) => c[k] != null) && (
              <div className="stats" style={{ marginTop: 0 }}>{METRICS.filter(([k]) => c[k] != null).map(([k, l, u]) => (
                <div className="stat" key={k}><div className="v">{fmtNum(Number(c[k]))}</div><div className="k">{u === "%" ? "% grasa" : `${u} ${l.toLowerCase()}`}</div></div>
              ))}</div>
            )}
            {c.notes && <><h3 className="sub">Indicaciones</h3><p className="how" style={{ whiteSpace: "pre-wrap" }}>{c.notes}</p></>}
            <button type="button" className="linkbtn danger" onClick={() => del(c)}>Borrar</button>
          </section>
        ))}</div>
    </>
  );
}
