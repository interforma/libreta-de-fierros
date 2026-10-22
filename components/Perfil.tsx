"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITIES, AREAS, ENERGY_GOALS, GOALS, MOMENTS, bmi, energy, monthsSince, suggestedEnergyGoal, redFlag, type Discomfort, type MealAi, type Profile, type Supplement } from "@/lib/health";
import { fmtNum, parseNum, shortDate, type Machine } from "@/lib/logic";
import { callCoach } from "@/lib/coachClient";
import Punto from "@/components/Punto";

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
        <EnergyBlock profile={profile} onEdit={() => setEdit(true)} onSave={onSave} />
        {/* sin datos para calcular energía, el plan escrito se sigue mostrando aquí */}
        {!energy(profile) && profile.nutrition && <><h3 className="sub">Alimentación</h3><p className="how" style={{ whiteSpace: "pre-wrap" }}>{profile.nutrition}</p></>}
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
        <option value="">{p.days_per_week ? `Según mis ${p.days_per_week} días por semana (recomendado)` : "Según días por semana"}</option>
        {ACTIVITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div className="field">Objetivo de calorías
        {(() => {
          const sug = suggestedEnergyGoal(p);
          const cur = ENERGY_GOALS.find((g) => g[0] === p.energy_goal);
          return <>
            <div className="chips">{ENERGY_GOALS.map(([k, l]) => (
              <button key={k} type="button" className={p.energy_goal === k ? "on" : ""} aria-pressed={p.energy_goal === k} onClick={() => set("energy_goal", p.energy_goal === k ? null : k)}>
                {l.split(" (")[0]}{sug?.key === k && <span className="sug-tag">Sugerido</span>}
              </button>
            ))}</div>
            {sug && (!p.energy_goal || p.energy_goal === sug.key)
              ? <span className="meta">{sug.why}</span>
              : cur && <span className="meta">{cur[4]}{sug ? ` Para tu objetivo sugerimos ${ENERGY_GOALS.find((g) => g[0] === sug.key)![1].split(" (")[0].toLowerCase()}.` : ""}</span>}
            {!sug && !p.energy_goal && <span className="meta">Elige primero tu objetivo más arriba y te sugerimos uno.</span>}
          </>;
        })()}
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
// Zona propia con alto contraste: la meta es el número principal (placa oscura, como el temporizador),
// proteína y gasto van debajo, y una guía fija explica qué significa cada cifra con comida concreta.
const PROTEIN_FOODS: [string, number][] = [
  ["100 g de pollo o pavo cocido (una palma)", 30],
  ["100 g de carne magra o pescado cocido", 25],
  ["1 lata de atún al agua, escurrida", 25],
  ["1 taza de porotos, lentejas o garbanzos cocidos", 15],
  ["1 yogur proteico (revisa la etiqueta)", 15],
  ["2 huevos", 12],
  ["1 taza de leche", 8],
  ["50 g de quesillo", 6],
];
function EnergyBlock({ profile, onEdit, onSave }: { profile: Profile; onEdit: () => void; onSave: (p: Profile) => Promise<void> }) {
  const e = energy(profile);
  if (!e) return null;
  const n = (x: number) => x.toLocaleString("es-CL");
  const sug = suggestedEnergyGoal(profile);
  if (!e.goal && !e.targetFromPro) return (
    <section className="ezone" aria-label="Energía diaria">
      <div className="ezone-title">Energía diaria</div>
      <div className="eplate">
        <div className="eplate-k">Gastas cerca de</div>
        <div className="eplate-v num">{n(e.tdee)} <small>kcal al día</small></div>
      </div>
      {sug && <p className="how">Para tu objetivo sugerimos <b>{ENERGY_GOALS.find((g) => g[0] === sug.key)![1].split(" (")[0].toLowerCase()}</b>. {sug.why}</p>}
      <button type="button" className="big" onClick={onEdit}>Elegir objetivo de calorías</button>
    </section>
  );
  const perMeal = Math.round(e.protein / 4 / 5) * 5;
  const goalName = e.goal ? e.goal[1].split(" (")[0].toLowerCase() : "indicada";
  return (
    <section className="ezone" aria-label="Energía diaria">
      <div className="ezone-title">Energía diaria <span className="ezone-tag">{e.targetFromPro ? "del nutricionista" : goalName}</span></div>
      <div className="eplate">
        <div className="eplate-k">Tu meta de hoy</div>
        <div className="eplate-v num">{n(e.target!)} <small>kcal</small></div>
        <div className="eplate-row">
          <div><span className="num">{e.protein} g</span><small>de proteína al día</small></div>
          <div><span className="num">{n(e.tdee)}</span><small>kcal que gastas</small></div>
        </div>
      </div>

      <details className="eguide">
        <summary>¿Qué significan estos números?</summary>
        <div className="eguide-body">
          <p><b>{n(e.target!)} kcal</b> es lo que te conviene comer en total cada día, sumando todas las comidas.
            {e.targetFromPro ? " Es la cifra que te indicó tu nutricionista." : e.delta === 0 ? " Es lo mismo que gastas, para mantener tu peso." : e.delta! > 0 ? ` Son ${Math.abs(e.delta!)} kcal más de lo que gastas, para tener material con qué construir músculo.` : ` Son ${Math.abs(e.delta!)} kcal menos de lo que gastas, para bajar grasa de a poco.`}</p>
          <p><b>{e.protein} g de proteína</b> es la proteína que debes consumir en el día, no el peso de la comida. Lo más fácil es repartirla en 4 comidas: <b>unos {perMeal} g en cada una</b>.</p>
          <div className="eguide-k">Cuánta proteína trae cada alimento</div>
          <ul className="pfoods">{PROTEIN_FOODS.map(([f, g]) => <li key={f}><span>{f}</span><b className="num">~{g} g</b></li>)}</ul>
          <p className="meta">Ejemplo para una comida de ~{perMeal} g: {perMeal >= 30 ? "100 g de pollo cocido, o 2 huevos con una taza de leche y un yogur proteico" : "1 lata de atún, o 2 huevos con una taza de leche"}.</p>
          <p className="meta">Basal {n(e.bmr)} kcal · actividad: {e.activityLabel}{e.floored ? " · meta ajustada para no bajar de tu basal" : ""}. Es una estimación: si en 3 a 4 semanas el peso o las medidas no van hacia donde buscas, ajusta unas 150 kcal o consúltalo en tu próximo control.</p>
        </div>
      </details>

      <MealCoach profile={profile} target={e.target!} protein={e.protein} onSave={onSave} />

      <details className="eguide plain">
        <summary><span>Tu plan escrito<small>{profile.nutrition.trim() ? "Lo que lee “Revisar mi plan”" : "Aún no tienes uno"}</small></span></summary>
        <div className="eguide-body">
          {profile.nutrition.trim()
            ? <p style={{ whiteSpace: "pre-wrap" }}>{profile.nutrition}</p>
            : <p>Pide un día de comidas al entrenador y toca <b>Usar como mi plan</b>, o escríbelo tú en Editar.</p>}
          <button type="button" className="linkbtn" onClick={onEdit}>Editar mi plan</button>
        </div>
      </details>
    </section>
  );
}

/* ---------------- Alimentación con el entrenador ---------------- */
// A pedido: un día de comidas de ejemplo o la revisión del plan escrito. Las cifras vienen de energy();
// Claude solo arma el menú. Punto es la cara de la respuesta, como en el chat de cada ejercicio.
function MealCoach({ profile, target, protein, onSave }: { profile: Profile; target: number; protein: number; onSave: (p: Profile) => Promise<void> }) {
  const [meal, setMeal] = useState<MealAi | null>(profile.meal_ai ?? null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<MealAi["mode"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hasPlan = profile.nutrition.trim().length >= 20;
  // si la meta cambió desde la última sugerencia, se avisa para pedir una nueva
  const stale = !!meal && (meal.kcal !== target || meal.protein !== protein);
  const [saving, setSaving] = useState(false);
  const adopted = !!meal && meal.mode === "dia" && profile.nutrition.includes(meal.text.slice(0, 120));

  // Reemplaza el plan escrito por el día que propuso el entrenador, con la meta a la vista.
  async function adopt() {
    if (!meal || saving) return;
    if (profile.nutrition.trim() && !confirm("¿Reemplazar tu plan escrito por este día de comidas?")) return;
    setSaving(true); setErr(null);
    try {
      const head = `Plan del entrenador (${shortDate(meal.at.slice(0, 10))}) para ${meal.kcal.toLocaleString("es-CL")} kcal y ${meal.protein} g de proteína:`;
      await onSave({ ...profile, nutrition: `${head}\n${meal.text}` });
    } catch { setErr("No se pudo guardar. Revisa tu conexión e intenta de nuevo."); }
    setSaving(false);
  }

  async function ask(mode: MealAi["mode"]) {
    if (busy) return;
    setBusy(mode); setErr(null); setOpen(true);
    try {
      const j = await callCoach<MealAi>("/api/alimentacion", { mode, previous: mode === "dia" && meal?.mode === "dia" ? meal.text : undefined });
      setMeal(j);
    } catch (e: any) { setErr(navigator.onLine ? e.message : "Sin señal: el entrenador necesita conexión para responder."); }
    setBusy(null);
  }

  // El botón principal siempre hace lo que dice: si ya hay un día vigente lo muestra; si no, pide uno nuevo.
  const dayReady = meal?.mode === "dia" && !stale;
  const when = (m: MealAi) => `${shortDate(m.at.slice(0, 10))}, ${new Date(m.at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
  const kind = (m: MealAi) => (m.mode === "dia" ? "Día de comidas" : "Revisión de tu plan");
  if (!open && !busy) return (
    <div className="mealbtns">
      <button type="button" className="askbtn" onClick={() => (dayReady ? setOpen(true) : ask("dia"))}>
        <Punto expr="atento" size={30} />
        <span><b>{dayReady ? "Ver tu día de comidas" : "Sugerir un día de comidas"}</b>
          <small>{dayReady ? `Armado el ${when(meal!)}` : `Con tu meta de ${target.toLocaleString("es-CL")} kcal y ${protein} g de proteína`}</small></span>
      </button>
      {meal && !dayReady && <button type="button" className="linkbtn" onClick={() => setOpen(true)}>Ver la última respuesta ({kind(meal).toLowerCase()})</button>}
    </div>
  );

  return (
    <div className="chat" aria-live="polite">
      <div className="top-row"><span className="who">Tu entrenador · alimentación</span><button type="button" className="linkbtn" onClick={() => setOpen(false)}>Ocultar</button></div>
      {busy ? (
        <div className="ma"><Punto expr="piensa" size={28} alive /><p className="meta">{busy === "dia" ? "Armando un día de comidas…" : "Revisando tu plan…"}</p></div>
      ) : meal && (
        <>
          <div className="eguide-k">{kind(meal)} · {when(meal)}</div>
          <div className="ma"><Punto expr="atento" size={28} /><p style={{ whiteSpace: "pre-wrap" }}>{meal.text}</p></div>
          {stale && <p className="meta">Tu meta cambió desde esta sugerencia. Pide una nueva para ajustarla.</p>}
          {meal.mode === "dia" && !stale && (adopted
            ? <p className="hint">Este es tu plan actual.</p>
            : <button type="button" className="big" disabled={saving} onClick={adopt}>{saving ? "Guardando…" : "Usar como mi plan"}</button>)}
        </>
      )}
      {err && <p className="msg">{err}</p>}
      <div className="chips">
        <button type="button" disabled={!!busy} onClick={() => ask("dia")}>{meal?.mode === "dia" ? "Otra opción de día" : "Sugerir un día de comidas"}</button>
        {hasPlan && <button type="button" disabled={!!busy} onClick={() => ask("revisar")}>Revisar mi plan</button>}
      </div>
      <p className="meta">Es una guía general. Si tienes indicaciones de tu nutricionista, mandan esas.</p>
    </div>
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
