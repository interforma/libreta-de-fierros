"use client";

// Pestaña Comida: lo comido en el día contra la meta de Energía diaria.
// Se anota con un toque (habituales), con una foto (etiqueta o plato) o escribiendo/dictando.
// Las cifras de cada comida se copian al anotarla; sin señal, queda en cola y se sube al volver la conexión.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { callCoach, shrinkPhoto } from "@/lib/coachClient";
import { energy, type Profile } from "@/lib/health";
import { fmtNum, keyOf, parseKey, parseNum, shortDate } from "@/lib/logic";
import Punto from "@/components/Punto";

export type Food = { id: string; name: string; kind: "producto" | "alimento" | "receta"; portion: string; kcal: number; protein_g: number; collagen_g: number; fruit_veg: number; source: "etiqueta" | "estimado" | "manual"; detail: string; uses: number };
export type Meal = { id: string; date: string; at: string; slot: Slot; food_id: string | null; name: string; qty: number; kcal: number; protein_g: number; collagen_g: number; fruit_veg: number; estimated: boolean; note: string };
type Slot = "desayuno" | "colacion" | "almuerzo" | "once" | "cena";
type Question = { id: string; texto: string; opciones: string[] };
type Estimate = { tipo: "etiqueta" | "plato" | "texto"; nombre: string; porcion: string; kcal: number; proteina_g: number; colageno_g: number; frutas_verduras: number; igual_a: string | null; rango: [number, number] | null; preguntas: Question[]; ingredientes: string[]; nota: string };
// Borrador de lo que se va a anotar: cifras POR PORCIÓN; la comida guarda cifras × cantidad.
type Draft = {
  name: string; portion: string; kcal: number; protein: number; collagen: number; fv: number;
  qty: number; slot: Slot; food_id: string | null; origin: "habitual" | "etiqueta" | "estimado";
  rango: [number, number] | null; preguntas: Question[]; answers: { texto: string; respuesta: string }[]; nota: string;
  ingredientes: string[]; fixes: string[]; // lo que vio la IA y las correcciones de la persona
  save: boolean; text?: string; image?: string;
};

export const SLOTS: [Slot, string][] = [["desayuno", "Desayuno"], ["colacion", "Colación"], ["almuerzo", "Almuerzo"], ["once", "Once"], ["cena", "Cena"]];
const slotName = (s: Slot) => SLOTS.find((x) => x[0] === s)![1];
function slotNow(d = new Date()): Slot {
  const h = d.getHours() + d.getMinutes() / 60;
  return h < 10.5 ? "desayuno" : h < 12 ? "colacion" : h < 16 ? "almuerzo" : h < 17.5 ? "colacion" : h < 20.5 ? "once" : "cena";
}
const kc = (n: number) => Math.round(n).toLocaleString("es-CL");
const gr = (n: number) => fmtNum(Math.round(n));
const qtyTxt = (q: number) => { const w = Math.floor(q), h = q - w >= 0.5 - 1e-6; return w === 0 ? "½" : `${w}${h ? "½" : ""}`; };
const lsGet = (k: string) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const uuid = () => (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const addDays = (k: string, n: number) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const DAYS_BACK = 13;
// Lo que vio la IA se guarda en la nota de la comida, para poder corregirla después sin la foto.
const SEEN = "Lo que vi: ";
const seenOf = (note: string) => (note.startsWith(SEEN) ? note.slice(SEEN.length).split(" · ").filter(Boolean) : []);
const seenNote = (xs: string[]) => (xs.length ? SEEN + xs.join(" · ") : "");

type Op = { op: "add"; row: Meal } | { op: "del"; id: string } | { op: "upd"; row: Meal };

export default function Comida({ uid, profile, todayKey, header, onGoProfile }: { uid: string; profile: Profile; todayKey: string; header: React.ReactNode; onGoProfile: () => void }) {
  const K = { f: `lf.${uid}.foods`, m: `lf.${uid}.meals`, q: `lf.${uid}.meals.pend` };
  const [foods, setFoods] = useState<Food[]>(() => lsGet(K.f) || []);
  const [meals, setMeals] = useState<Meal[]>(() => lsGet(K.m) || []);
  const [day, setDay] = useState(todayKey);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // texto de espera mientras la IA estima
  const [err, setErr] = useState<string | null>(null);
  const [allHab, setAllHab] = useState(false);
  const [sug, setSug] = useState<{ busy: boolean; text: string | null; err: string | null; day: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const e = energy(profile);

  /* ---- carga y cola sin señal ---- */
  const putMeals = (fn: (m: Meal[]) => Meal[]) => setMeals((prev) => { const n = fn(prev); lsSet(K.m, n); return n; });
  async function flush() {
    const q: Op[] = lsGet(K.q) || [];
    if (!q.length || !navigator.onLine) return;
    const left: Op[] = [];
    for (const o of q) {
      const { error } = o.op === "del" ? await supabase.from("meals").delete().eq("id", o.id)
        : await supabase.from("meals").upsert(strip(o.row));
      if (error) left.push(o);
    }
    lsSet(K.q, left);
  }
  const strip = (m: Meal) => ({ id: m.id, date: m.date, at: m.at, slot: m.slot, food_id: m.food_id, name: m.name, qty: m.qty, kcal: m.kcal, protein_g: m.protein_g, collagen_g: m.collagen_g, fruit_veg: m.fruit_veg, estimated: m.estimated, note: m.note });
  function queue(o: Op) { lsSet(K.q, [...(lsGet(K.q) || []), o]); flush(); }

  useEffect(() => {
    let alive = true;
    (async () => {
      await flush();
      const since = addDays(todayKey, -DAYS_BACK);
      const [f, m] = await Promise.all([
        supabase.from("foods").select("id,name,kind,portion,kcal,protein_g,collagen_g,fruit_veg,source,detail,uses").order("uses", { ascending: false }).order("name"),
        supabase.from("meals").select("id,date,at,slot,food_id,name,qty,kcal,protein_g,collagen_g,fruit_veg,estimated,note").gte("date", since).order("at"),
      ]);
      if (!alive || f.error || m.error) return;
      const nf = (f.data as any[]).map((x) => ({ ...x, kcal: Number(x.kcal), protein_g: Number(x.protein_g), collagen_g: Number(x.collagen_g), fruit_veg: Number(x.fruit_veg) })) as Food[];
      const nm = (m.data as any[]).map((x) => ({ ...x, qty: Number(x.qty), kcal: Number(x.kcal), protein_g: Number(x.protein_g), collagen_g: Number(x.collagen_g), fruit_veg: Number(x.fruit_veg) })) as Meal[];
      // lo anotado sin señal que aún no sube se mantiene a la vista
      const pend: Op[] = lsGet(K.q) || [];
      const dels = new Set(pend.filter((o) => o.op === "del").map((o: any) => o.id));
      const adds = pend.filter((o) => o.op !== "del").map((o: any) => o.row as Meal);
      const merged = [...nm.filter((x) => !dels.has(x.id) && !adds.some((a) => a.id === x.id)), ...adds].sort((a, b) => (a.at < b.at ? -1 : 1));
      setFoods(nf); lsSet(K.f, nf); setMeals(merged); lsSet(K.m, merged);
    })();
    const on = () => flush();
    window.addEventListener("online", on);
    return () => { alive = false; window.removeEventListener("online", on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
  useEffect(() => { setDay((d) => (d > todayKey ? todayKey : d)); }, [todayKey]);

  /* ---- totales ---- */
  const dayMeals = meals.filter((m) => m.date === day);
  const tot = useMemo(() => dayMeals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.protein_g, c: a.c + m.collagen_g, fv: a.fv + m.fruit_veg, est: a.est || m.estimated }), { kcal: 0, p: 0, c: 0, fv: 0, est: false }), [dayMeals]);
  const week = useMemo(() => {
    // promedio de los días anteriores con registro (sin contar hoy, que aún no termina)
    const from = addDays(todayKey, -7);
    const by: Record<string, { kcal: number; p: number }> = {};
    meals.filter((m) => m.date >= from && m.date < todayKey).forEach((m) => { (by[m.date] ||= { kcal: 0, p: 0 }); by[m.date].kcal += m.kcal; by[m.date].p += m.protein_g; });
    const ds = Object.values(by);
    return ds.length ? { n: ds.length, kcal: ds.reduce((a, d) => a + d.kcal, 0) / ds.length, p: ds.reduce((a, d) => a + d.p, 0) / ds.length } : null;
  }, [meals, todayKey]);

  /* ---- anotar ---- */
  function fromFood(f: Food): Draft {
    return { name: f.name, portion: f.portion, kcal: f.kcal, protein: f.protein_g, collagen: f.collagen_g, fv: f.fruit_veg, qty: 1, slot: slotNow(), food_id: f.id, origin: "habitual", rango: null, preguntas: [], answers: [], nota: f.detail, ingredientes: [], fixes: [], save: false };
  }
  function fromEstimate(x: Estimate, base?: Partial<Draft>): Draft {
    const f = x.igual_a ? foods.find((y) => y.id === x.igual_a) : null;
    if (f && !base?.fixes?.length) return { ...fromFood(f), qty: base?.qty ?? 1, slot: base?.slot ?? slotNow(), nota: x.tipo === "plato" ? "Lo reconocí como uno de tus habituales." : "" };
    return {
      name: x.nombre, portion: x.porcion, kcal: x.kcal, protein: x.proteina_g, collagen: x.colageno_g, fv: x.frutas_verduras,
      qty: base?.qty ?? 1, slot: base?.slot ?? slotNow(), food_id: null, origin: x.tipo === "etiqueta" ? "etiqueta" : "estimado",
      rango: x.rango, preguntas: x.preguntas, answers: base?.answers ?? [], nota: x.nota,
      ingredientes: x.ingredientes || [], fixes: base?.fixes ?? [],
      save: x.tipo === "etiqueta" && !base?.fixes?.length, text: base?.text, image: base?.image,
    };
  }
  async function estimate(body: { image?: string; text?: string }, base?: Partial<Draft>) {
    setErr(null); setBusy(base?.fixes?.length ? "Corrigiendo…" : body.image ? "Leyendo la foto…" : "Calculando…");
    try {
      const x = await callCoach<Estimate>("/api/comida/estimar", {
        ...body, media_type: body.image ? "image/jpeg" : undefined, answers: base?.answers, correccion: base?.fixes?.join(". ") || undefined,
        previous: base?.name ? { nombre: base.name, porcion: base.portion, kcal: base.kcal, proteina_g: base.protein, ingredientes: base.ingredientes } : undefined,
      });
      setDraft(fromEstimate(x, { ...base, text: body.text, image: body.image }));
      setWriting(false);
    } catch (er: any) { setErr(er?.message || "No se pudo calcular."); }
    setBusy(null);
  }
  async function onPhoto(file?: File) {
    if (!file) return;
    if (!navigator.onLine) { setErr("Sin señal no puedo leer la foto. Anota con un habitual o escríbelo cuando vuelva la conexión."); return; }
    try { const { base64 } = await shrinkPhoto(file, 1280); await estimate({ image: base64 }); }
    catch { setErr("No se pudo abrir la foto. Prueba de nuevo."); setBusy(null); }
  }
  function answer(q: Question, opt: string) {
    if (!draft) return;
    const answers = [...draft.answers.filter((a) => a.texto !== q.texto), { texto: q.texto, respuesta: opt }];
    estimate({ image: draft.image, text: draft.text }, { ...draft, answers });
  }
  function fixDraft(t: string) {
    if (!draft || t.trim().length < 2) return;
    estimate({ image: draft.image, text: draft.text }, { ...draft, fixes: [...draft.fixes, t.trim()] });
  }
  async function commit(d: Draft) {
    let food_id = d.food_id;
    if (d.save && !food_id && navigator.onLine) {
      const { data } = await supabase.from("foods").upsert({
        name: d.name.trim(), kind: d.origin === "etiqueta" ? "producto" : "alimento", portion: d.portion, kcal: Math.round(d.kcal),
        protein_g: d.protein, collagen_g: d.collagen, fruit_veg: d.fv, source: d.origin === "etiqueta" ? "etiqueta" : "estimado", detail: d.nota || "",
      }, { onConflict: "user_id,name" }).select("id,name,kind,portion,kcal,protein_g,collagen_g,fruit_veg,source,detail,uses").single();
      if (data) { food_id = data.id; setFoods((fs) => { const n = [...fs.filter((x) => x.id !== data.id), { ...(data as any), kcal: Number(data.kcal), protein_g: Number(data.protein_g), collagen_g: Number(data.collagen_g), fruit_veg: Number(data.fruit_veg) }]; lsSet(K.f, n); return n; }); }
    }
    const now = new Date();
    const at = day === todayKey ? now.toISOString() : new Date(`${day}T${String(now.getHours()).padStart(2, "0")}:00:00`).toISOString();
    const row: Meal = {
      id: uuid(), date: day, at, slot: d.slot, food_id, name: d.name.trim() || "Comida", qty: d.qty,
      kcal: Math.round(d.kcal * d.qty), protein_g: Math.round(d.protein * d.qty * 10) / 10, collagen_g: Math.round(d.collagen * d.qty * 10) / 10,
      fruit_veg: Math.round(d.fv * d.qty * 2) / 2, estimated: d.origin === "estimado" || (d.origin === "habitual" && foods.find((f) => f.id === food_id)?.source === "estimado"), note: seenNote(d.ingredientes),
    };
    putMeals((ms) => [...ms, row]);
    queue({ op: "add", row });
    if (food_id) {
      const f = foods.find((x) => x.id === food_id);
      if (f) { supabase.from("foods").update({ uses: f.uses + 1, last_used: now.toISOString() }).eq("id", food_id).then(() => {}); setFoods((fs) => fs.map((x) => (x.id === food_id ? { ...x, uses: x.uses + 1 } : x))); }
    }
    setDraft(null); setSug(null);
  }
  function saveEdit(row: Meal) {
    putMeals((ms) => ms.map((x) => (x.id === row.id ? row : x)));
    queue({ op: "upd", row });
    setEditing(null); setSug(null);
  }
  function remove(m: Meal) {
    putMeals((ms) => ms.filter((x) => x.id !== m.id));
    queue({ op: "del", id: m.id });
    setEditing(null); setSug(null);
  }
  async function suggest() {
    setSug({ busy: true, text: null, err: null, day });
    await flush();
    try { const r = await callCoach<{ text: string }>("/api/comida/sugerir", { date: day, hour: new Date().getHours() }); setSug({ busy: false, text: r.text, err: null, day }); }
    catch (er: any) { setSug({ busy: false, text: null, err: er?.message || "No se pudo preparar la sugerencia.", day }); }
  }

  /* ---- vista ---- */
  const isToday = day === todayKey;
  const hab = foods.slice().sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name, "es"));
  const target = e?.target ?? null, protein = e?.protein ?? null;
  const pct = target ? Math.min(100, (tot.kcal / target) * 100) : 0;
  const leftK = target != null ? Math.round(target - tot.kcal) : null, leftP = protein != null ? Math.round(protein - tot.p) : null;

  return (
    <>
      {header}
      <div className="cday" role="group" aria-label="Día">
        <button type="button" aria-label="Día anterior" disabled={day <= addDays(todayKey, -DAYS_BACK)} onClick={() => { setDay(addDays(day, -1)); setSug(null); }}>‹</button>
        <b>{isToday ? "Hoy" : day === addDays(todayKey, -1) ? "Ayer" : shortDate(day)}<span className="meta">{shortDate(day)}</span></b>
        <button type="button" aria-label="Día siguiente" disabled={isToday} onClick={() => { setDay(addDays(day, 1)); setSug(null); }}>›</button>
      </div>

      <section className="cplate" aria-label="Total del día">
        <div className="cplate-k">{isToday ? "Llevas hoy" : "Comiste ese día"}{tot.est ? " · aprox." : ""}</div>
        <div className="cplate-v num">{kc(tot.kcal)} <small>{target ? `de ${kc(target)} kcal` : "kcal"}</small></div>
        {target && <div className="cbar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(tot.kcal)} aria-label="Calorías del día"><i style={{ width: `${pct}%` }} /></div>}
        <div className="ctiles">
          <div><b className="num">{gr(tot.p)} g</b><span>{protein ? `de ${protein} g de proteína` : "de proteína"}</span>{tot.c > 0 && <small>incluye {gr(tot.c)} g de colágeno</small>}</div>
          <div><b className="num">{fmtNum(tot.fv)}</b><span>de 5 frutas y verduras</span></div>
        </div>
        {target && dayMeals.length > 0 && (
          <p className="cleft">{leftK! > 50 || leftP! > 3
            ? `${isToday ? "Te faltan" : "Faltaron"} ${leftK! > 50 ? `${kc(leftK!)} kcal` : ""}${leftK! > 50 && leftP! > 3 ? " y " : ""}${leftP! > 3 ? `${leftP} g de proteína` : ""}.`
            : isToday ? "Llegaste a tu meta de hoy." : "Ese día llegaste a tu meta."}</p>
        )}
      </section>
      {!target && (
        <div className="nudge" style={{ marginTop: 12 }}><b>Sin meta todavía</b><span>Completa edad, estatura y peso en Perfil y elige un objetivo de calorías para ver cuánto te falta.</span>
          <button type="button" className="linkbtn" style={{ marginTop: 8 }} onClick={onGoProfile}>Ir a Perfil</button></div>
      )}

      <h2 className="sect">Anotar {isToday ? "lo que comiste" : `en ${shortDate(day)}`}</h2>
      <div className="cadd">
        <button type="button" className="big" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          Foto de etiqueta o plato
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(ev) => { onPhoto(ev.target.files?.[0]); ev.target.value = ""; }} />
        <button type="button" className="big ghost" onClick={() => { setWriting(true); setErr(null); }} disabled={!!busy}>Escribir o dictar</button>
      </div>
      {busy && !draft && <div className="cbusy" aria-live="polite"><Punto expr="piensa" size={34} alive /><span>{busy}</span></div>}
      {err && !draft && !writing && <p className="msg" style={{ marginTop: 10 }}>{err}</p>}

      {hab.length > 0 && <>
        <h3 className="csub">Tus habituales <span>un toque y listo</span></h3>
        <div className="chab">
          {(allHab ? hab : hab.slice(0, 8)).map((f) => (
            <button key={f.id} type="button" onClick={() => { setDraft(fromFood(f)); setErr(null); }}>
              <b>{f.name}</b><span className="num">{kc(f.kcal)} kcal · {gr(f.protein_g)} g</span><small>{f.portion}</small>
            </button>
          ))}
        </div>
        {hab.length > 8 && <button type="button" className="linkbtn" style={{ marginTop: 10 }} onClick={() => setAllHab(!allHab)}>{allHab ? "Ver menos" : `Ver todos (${hab.length})`}</button>}
      </>}

      {isToday && target && dayMeals.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {sug?.day === day && (sug.busy || sug.text || sug.err) ? (
            <div className="chat" aria-live="polite">
              <span className="who">Tu entrenador · próxima comida</span>
              {sug.busy ? <div className="ma"><Punto expr="piensa" size={28} alive /><p className="meta">Mirando lo que llevas…</p></div>
                : sug.text ? <div className="ma"><Punto expr="atento" size={28} /><p style={{ whiteSpace: "pre-wrap" }}>{sug.text}</p></div>
                : <p className="msg">{sug.err}</p>}
              {!sug.busy && <button type="button" className="linkbtn" onClick={suggest}>Otra idea</button>}
            </div>
          ) : (
            <button type="button" className="askbtn" onClick={suggest}>
              <Punto expr="atento" size={30} />
              <span><b>¿Qué como ahora?</b><small>Según lo que te falta hoy</small></span>
            </button>
          )}
        </div>
      )}

      <h2 className="sect">{isToday ? "Lo que comiste hoy" : `Lo que comiste el ${shortDate(day)}`}</h2>
      {dayMeals.length === 0 ? <p className="meta" style={{ margin: "8px 2px 0" }}>Nada anotado {isToday ? "todavía" : "ese día"}.</p> : (
        <div className="list">{SLOTS.filter(([s]) => dayMeals.some((m) => m.slot === s)).map(([s, label]) => {
          const ms = dayMeals.filter((m) => m.slot === s);
          return (
            <section className="card cslot" key={s}>
              <div className="cslot-h"><b>{label}</b><span className="num">{kc(ms.reduce((a, m) => a + m.kcal, 0))} kcal</span></div>
              {ms.map((m) => (
                <button type="button" key={m.id} className="cmeal" onClick={() => setEditing(m)}>
                  <span><b>{m.qty !== 1 ? `${qtyTxt(m.qty)} × ` : ""}{m.name}</b>{m.estimated && <em>estimado</em>}</span>
                  <span className="num">{kc(m.kcal)} kcal · {gr(m.protein_g)} g</span>
                </button>
              ))}
            </section>
          );
        })}</div>
      )}

      {week && (
        <>
          <h2 className="sect">Promedio de la semana</h2>
          <div className="ctiles flat">
            <div><b className="num">{kc(week.kcal)}</b><span>kcal al día{target ? ` (meta ${kc(target)})` : ""}</span></div>
            <div><b className="num">{gr(week.p)} g</b><span>de proteína al día{protein ? ` (meta ${protein})` : ""}</span></div>
          </div>
          <p className="meta" style={{ margin: "8px 2px 0" }}>{week.n === 1 ? "Con 1 día anotado" : `Con ${week.n} días anotados`} de los últimos 7. Un día corto no importa: lo que pesa es el promedio.</p>
        </>
      )}

      {writing && <WriteSheet busy={busy} err={err} onClose={() => { setWriting(false); setErr(null); }} onSend={(t) => estimate({ text: t })} />}
      {draft && <DraftSheet draft={draft} busy={busy} err={err} onChange={setDraft} onAnswer={answer} onFix={fixDraft} onClose={() => { setDraft(null); setErr(null); }} onSave={commit} />}
      {editing && <EditSheet meal={editing} onClose={() => setEditing(null)} onSave={saveEdit} onRemove={remove} />}
    </>
  );
}

/* ---------------- hojas ---------------- */

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet-bg" role="dialog" aria-modal="true" aria-label={label} onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="sheet">{children}</div>
    </div>
  );
}

function QtyStep({ qty, onQty, portion }: { qty: number; onQty: (q: number) => void; portion?: string }) {
  return (
    <div className="field"><span>Cantidad</span>
      <div className="step">
        <button type="button" aria-label="Menos" disabled={qty <= 0.5} onClick={() => onQty(Math.max(0.5, qty - 0.5))}>−</button>
        <div className="unit" style={{ textAlign: "center" }}><span className="num cqty">{qtyTxt(qty)}</span><small>{portion ? (qty === 1 ? portion : `× ${portion}`) : qty === 1 ? "porción" : "porciones"}</small></div>
        <button type="button" aria-label="Más" onClick={() => onQty(Math.min(10, qty + 0.5))}>+</button>
      </div>
    </div>
  );
}
function SlotChips({ slot, onSlot }: { slot: Slot; onSlot: (s: Slot) => void }) {
  return (
    <div className="field"><span>¿Qué comida es?</span>
      <div className="chips">{SLOTS.map(([s, l]) => <button key={s} type="button" className={slot === s ? "on" : ""} aria-pressed={slot === s} onClick={() => onSlot(s)}>{l}</button>)}</div>
    </div>
  );
}

// Lo que vio la IA, como lista, y un campo para decirle qué faltó o sobró.
function SeenList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="cseen"><span>Lo que vi</span>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
function FixBox({ prompt, hint, busy, onFix }: { prompt: string; hint: string; busy: boolean; onFix: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div className="field cq"><span>{prompt}</span>
      <textarea className="ctext" rows={2} value={t} onChange={(ev) => setT(ev.target.value)} placeholder={hint} aria-label={prompt} />
      <button type="button" className="big ghost" disabled={busy || t.trim().length < 2} onClick={() => { onFix(t); setT(""); }}>Corregir y recalcular</button>
    </div>
  );
}

function DraftSheet({ draft: d, busy, err, onChange, onAnswer, onFix, onClose, onSave }: {
  draft: Draft; busy: string | null; err: string | null; onChange: (d: Draft) => void; onAnswer: (q: Question, opt: string) => void; onFix: (t: string) => void; onClose: () => void; onSave: (d: Draft) => void;
}) {
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => onChange({ ...d, ...p });
  const tag = d.origin === "habitual" ? "Tu habitual" : d.origin === "etiqueta" ? "De la etiqueta" : "Estimado";
  const open = d.preguntas.filter((q) => !d.answers.some((a) => a.texto === q.texto));
  return (
    <Sheet label="Anotar comida" onClose={onClose}>
      <div className="top-row"><span className={`ctag ${d.origin}`}>{tag}</span><button type="button" className="linkbtn quiet" onClick={onClose}>Cancelar</button></div>
      <input className="cname" aria-label="Nombre" value={d.name} onChange={(ev) => set({ name: ev.target.value })} />
      <div className="ctiles flat">
        <div><b className="num">{kc(d.kcal * d.qty)}</b><span>kcal{d.rango ? ` (entre ${kc(d.rango[0] * d.qty)} y ${kc(d.rango[1] * d.qty)})` : ""}</span></div>
        <div><b className="num">{gr(d.protein * d.qty)} g</b><span>de proteína</span>{d.collagen > 0 && <small>{gr(d.collagen * d.qty)} g son colágeno</small>}</div>
      </div>
      {d.fv > 0 && <p className="meta" style={{ margin: 0 }}>Suma {fmtNum(d.fv * d.qty)} {d.fv * d.qty === 1 ? "porción" : "porciones"} de fruta o verdura.</p>}
      {d.nota && <p className="how" style={{ margin: 0 }}>{d.nota}</p>}
      <SeenList items={d.ingredientes} />
      {d.fixes.length > 0 && <p className="meta" style={{ margin: 0 }}>Corregido: {d.fixes.join(" · ")}</p>}

      {busy ? <div className="cbusy" aria-live="polite"><Punto expr="piensa" size={34} alive /><span>Recalculando…</span></div>
        : open.map((q) => (
          <div className="field cq" key={q.texto}><span>{q.texto}</span>
            <div className="chips">{q.opciones.map((o) => <button key={o} type="button" onClick={() => onAnswer(q, o)}>{o}</button>)}</div>
          </div>
        ))}
      {d.answers.length > 0 && <p className="meta" style={{ margin: 0 }}>{d.answers.map((a) => a.respuesta).join(" · ")}</p>}
      {d.origin === "estimado" && !busy && (
        <FixBox busy={!!busy} onFix={onFix}
          prompt={d.image ? "¿Falta o sobra algo en el plato?" : "¿Falta o sobra algo?"}
          hint={d.image ? "Ej.: también había papas, teñidas por la betarraga" : "Ej.: eran 2 huevos, no 1"} />
      )}
      {err && <p className="msg">{err}</p>}

      <QtyStep qty={d.qty} portion={d.portion} onQty={(qty) => set({ qty })} />
      <SlotChips slot={d.slot} onSlot={(slot) => set({ slot })} />

      <details className="eguide plain">
        <summary><span>Corregir las cifras<small>Por {d.portion}</small></span></summary>
        <div className="eguide-body fields">
          <label className="field">kcal<input inputMode="numeric" defaultValue={Math.round(d.kcal)} onBlur={(ev) => { const v = parseNum(ev.target.value); if (v != null) set({ kcal: v, rango: null }); }} /></label>
          <label className="field">Proteína (g)<input inputMode="decimal" defaultValue={fmtNum(d.protein)} onBlur={(ev) => { const v = parseNum(ev.target.value); if (v != null) set({ protein: v }); }} /></label>
        </div>
      </details>
      {d.origin !== "habitual" && (
        <label className="toggle"><div><b>Guardar en mis habituales</b><div className="meta">La próxima vez lo anotas con un toque.</div></div>
          <input type="checkbox" className="cswitch" checked={d.save} onChange={(ev) => set({ save: ev.target.checked })} /></label>
      )}
      <button type="button" className="big" disabled={!!busy || saving} onClick={async () => { setSaving(true); await onSave(d); setSaving(false); }}>
        {saving ? "Anotando…" : `Anotar en ${slotName(d.slot).toLowerCase()}`}
      </button>
      {open.length > 0 && !busy && <p className="meta" style={{ margin: 0 }}>Si respondes, la cifra queda más precisa. También puedes anotar así.</p>}
    </Sheet>
  );
}

function WriteSheet({ busy, err, onClose, onSend }: { busy: string | null; err: string | null; onClose: () => void; onSend: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <Sheet label="Escribir lo que comiste" onClose={onClose}>
      <div className="top-row"><h2 className="sheet-title">¿Qué comiste?</h2><button type="button" className="linkbtn quiet" onClick={onClose}>Cancelar</button></div>
      <p className="meta" style={{ margin: 0 }}>Escríbelo o toca el micrófono del teclado para dictarlo. Mientras más detalle (cantidad, crudo o cocido, con aceite), más precisa la cifra.</p>
      <textarea className="ctext" rows={4} autoFocus value={t} onChange={(ev) => setT(ev.target.value)} placeholder="Ej.: 2 huevos revueltos con una marraqueta y palta" />
      {busy ? <div className="cbusy" aria-live="polite"><Punto expr="piensa" size={34} alive /><span>{busy}</span></div>
        : <button type="button" className="big" disabled={t.trim().length < 2} onClick={() => onSend(t.trim())}>Calcular</button>}
      {err && <p className="msg">{err}</p>}
    </Sheet>
  );
}

function EditSheet({ meal, onClose, onSave, onRemove }: { meal: Meal; onClose: () => void; onSave: (m: Meal) => void; onRemove: (m: Meal) => void }) {
  // Cifras por porción, para que la cantidad las multiplique; se guardan ya multiplicadas.
  const per = { kcal: meal.kcal / meal.qty, p: meal.protein_g / meal.qty, c: meal.collagen_g / meal.qty, fv: meal.fruit_veg / meal.qty };
  const [m, setM] = useState({ name: meal.name, qty: meal.qty, slot: meal.slot, ...per, seen: seenOf(meal.note), estimated: meal.estimated, food_id: meal.food_id, fixed: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const set = (p: Partial<typeof m>) => setM((x) => ({ ...x, ...p }));
  async function fix(t: string) {
    setBusy(true); setErr(null);
    try {
      const x = await callCoach<Estimate>("/api/comida/estimar", {
        correccion: t.trim(),
        previous: { nombre: m.name, porcion: "1 porción", kcal: m.kcal, proteina_g: m.p, ingredientes: m.seen },
      });
      set({ name: x.nombre, kcal: x.kcal, p: x.proteina_g, c: x.colageno_g, fv: x.frutas_verduras, seen: x.ingredientes || [], estimated: true, food_id: null, fixed: [...m.fixed, t.trim()] });
    } catch (er: any) { setErr(er?.message || "No se pudo corregir. Prueba de nuevo."); }
    setBusy(false);
  }
  const save = () => onSave({
    ...meal, name: m.name.trim() || meal.name, qty: m.qty, slot: m.slot, food_id: m.food_id, estimated: m.estimated,
    kcal: Math.round(m.kcal * m.qty), protein_g: Math.round(m.p * m.qty * 10) / 10, collagen_g: Math.round(m.c * m.qty * 10) / 10, fruit_veg: Math.round(m.fv * m.qty * 2) / 2,
    note: m.seen.length ? seenNote(m.seen) : meal.note,
  });
  return (
    <Sheet label="Editar comida" onClose={onClose}>
      <div className="top-row"><span className={`ctag ${m.estimated ? "estimado" : "habitual"}`}>{m.estimated ? "Estimado" : "Cifra real"}</span><button type="button" className="linkbtn quiet" onClick={onClose}>Cerrar</button></div>
      <input className="cname" aria-label="Nombre" value={m.name} onChange={(ev) => set({ name: ev.target.value })} />
      <div className="ctiles flat">
        <div><b className="num">{kc(m.kcal * m.qty)}</b><span>kcal</span></div>
        <div><b className="num">{gr(m.p * m.qty)} g</b><span>de proteína</span>{m.c > 0 && <small>{gr(m.c * m.qty)} g son colágeno</small>}</div>
      </div>
      <SeenList items={m.seen} />
      {m.fixed.length > 0 && <p className="meta" style={{ margin: 0 }}>Corregido: {m.fixed.join(" · ")}. Toca Guardar cambios para dejarlo así.</p>}
      {busy ? <div className="cbusy" aria-live="polite"><Punto expr="piensa" size={34} alive /><span>Corrigiendo…</span></div>
        : <FixBox busy={busy} onFix={fix} prompt="¿La IA se equivocó? Dile qué faltó o sobró" hint="Ej.: también había papas, teñidas por la betarraga" />}
      {err && <p className="msg">{err}</p>}
      <QtyStep qty={m.qty} onQty={(qty) => set({ qty })} />
      <SlotChips slot={m.slot} onSlot={(slot) => set({ slot })} />
      <details className="eguide plain">
        <summary><span>Corregir las cifras a mano<small>Por porción</small></span></summary>
        <div className="eguide-body fields" key={`${m.kcal}-${m.p}`}>
          <label className="field">kcal<input inputMode="numeric" defaultValue={Math.round(m.kcal)} onBlur={(ev) => { const v = parseNum(ev.target.value); if (v != null) set({ kcal: v }); }} /></label>
          <label className="field">Proteína (g)<input inputMode="decimal" defaultValue={fmtNum(Math.round(m.p * 10) / 10)} onBlur={(ev) => { const v = parseNum(ev.target.value); if (v != null) set({ p: v }); }} /></label>
        </div>
      </details>
      <button type="button" className="big" disabled={busy} onClick={save}>Guardar cambios</button>
      {sure
        ? <button type="button" className="big ghost cdanger" onClick={() => onRemove(meal)}>Sí, quitar {meal.name}</button>
        : <button type="button" className="linkbtn danger" onClick={() => setSure(true)}>Quitar esta comida</button>}
    </Sheet>
  );
}
