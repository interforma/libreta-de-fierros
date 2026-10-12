"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  DAYS, MONTHS, FEELS, FOOD, feelName, fmtNum, fmtW, freshItem, itemDone, keyOf, lastFor, metricOf, mmss,
  parseKey, parseNum, routineForDay, setW, shortDate, targetText, toKg, toLb, unitOf, wIn,
  type ItemDef, type ItemLog, type Machine, type Routine, type Session, type Unit,
} from "@/lib/logic";

/* ---------- almacenamiento local (caché y cola sin conexión) ---------- */
const lsGet = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ===================================================================== */
export default function App() {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => data.subscription.unsubscribe();
  }, []);

  if (auth === undefined) return <div className="wrap"><p className="meta" style={{ paddingTop: 40 }}>Cargando…</p></div>;
  if (!auth) return <Login />;
  return <Logbook uid={auth.user.id} />;
}

/* ---------- login ---------- */
function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) setMsg({ t: /confirm/i.test(error.message) ? "Confirma tu correo antes de entrar: revisa tu bandeja de entrada." : "Correo o contraseña incorrectos." });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: window.location.origin } });
      if (error) setMsg({ t: error.message.includes("Password") ? "La contraseña debe tener al menos 6 caracteres." : "No se pudo crear la cuenta. Intenta de nuevo." });
      else if (!data.session) setMsg({ t: "Cuenta creada. Te enviamos un correo para confirmarla; después vuelve y entra.", ok: true });
    }
    setBusy(false);
  }

  return (
    <form className="login" onSubmit={submit}>
      <div className="eyebrow">Tu registro de gimnasio</div>
      <h1>Libreta de Fierros</h1>
      <p>{mode === "in" ? "Entra para ver la rutina de hoy." : "Crea tu cuenta. Tus registros quedan privados."}</p>
      <label>Correo<input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Contraseña<input id="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} /></label>
      {msg && <p className={`msg ${msg.ok ? "ok" : ""}`}>{msg.t}</p>}
      <button className="big" type="submit" disabled={busy}>{busy ? "Un momento…" : mode === "in" ? "Entrar" : "Crear cuenta"}</button>
      <button className="linkbtn" type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
        {mode === "in" ? "¿Primera vez? Crea tu cuenta" : "Ya tengo cuenta: entrar"}
      </button>
    </form>
  );
}


/* ---------- controles (a nivel de módulo para que no se remonten) ---------- */
type F = "w" | "reps" | "secs" | "min";
function Stepper({ id, value, label, sub, onStep, onTyped }: { id: string; value: number | null | undefined; label: string; sub?: string; onStep: (dir: 1 | -1) => void; onTyped: (raw: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="step">
      <button type="button" aria-label="Menos" onClick={() => onStep(-1)}>−</button>
      <div className="unit">
        <input className="num" id={id} inputMode="decimal" placeholder="—" aria-label={label}
          value={draft ?? fmtNum(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft != null) { onTyped(draft); setDraft(null); } }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <small>{sub ?? label}</small>
      </div>
      <button type="button" aria-label="Más" onClick={() => onStep(1)}>+</button>
    </div>
  );
}
function NoteInput({ id, value, onSave }: { id: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="note" id={id} placeholder="Nota: asiento 4, agarre ancho…" value={v}
    onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v.slice(0, 200)); }} />;
}
function RestBar({ rest, onPlus, onClose }: { rest: { end: number; total: number; label: string }; onPlus: () => void; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => { fired.current = false; setNow(Date.now()); const iv = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(iv); }, [rest]);
  const left = Math.ceil((rest.end - now) / 1000);
  useEffect(() => {
    if (left <= 0 && !fired.current) { fired.current = true; beep(); }
    if (left < -20) onClose();
  }, [left, onClose]);
  return (
    <div className={`timer ${left <= 0 ? "end" : ""}`}>
      <div className="fill" style={{ width: `${left <= 0 ? 100 : 100 * (1 - left / rest.total)}%` }} />
      <div className="t">{left <= 0 ? "0:00" : mmss(left)}</div>
      <div className="l">{left <= 0 ? "A la siguiente serie" : rest.label}</div>
      <button type="button" onClick={onPlus}>+30 s</button>
      <button type="button" onClick={onClose}>Listo</button>
    </div>
  );
}
let actx: AudioContext | null = null;
function unlockAudio() { try { actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)(); actx.resume?.(); } catch {} }
function beep() {
  try {
    const a = actx; if (a) [0, 0.22, 0.44].forEach((t) => {
      const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, a.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.18); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.2);
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

/* ===================================================================== */
type Sync = "busy" | "ok" | "offline" | "error";

function Logbook({ uid }: { uid: string }) {
  const K = { m: `lf.${uid}.machines`, r: `lf.${uid}.routines`, s: `lf.${uid}.sessions`, p: `lf.${uid}.pending` };
  const [machines, setMachines] = useState<Record<string, Machine>>(() => lsGet(K.m) || {});
  const [routines, setRoutines] = useState<Routine[]>(() => lsGet(K.r) || []);
  const [sessions, setSessions] = useState<Record<string, Session>>(() => lsGet(K.s) || {});
  const [todayKey, setTodayKey] = useState(() => keyOf(new Date()));
  const [today, setToday] = useState<Session | null>(null);
  const todayRef = useRef<Session | null>(null);
  const [tab, setTab] = useState<"hoy" | "prog" | "plan">("hoy");
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [progOpen, setProgOpen] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState<number | null>(null);
  const [sync, setSync] = useState<Sync>("busy");
  const [loaded, setLoaded] = useState(false);

  /* ---- carga inicial ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      await supabase.rpc("seed_defaults");
      const [m, r, s] = await Promise.all([
        supabase.from("machines").select("slug,name,muscle_group,how_to,unit,settings,photo_path"),
        supabase.from("routines").select("slug,name,type,weekdays,duration_min,items,position").order("position"),
        supabase.from("sessions").select("date,routine_slug,items,client_updated_at").order("date", { ascending: false }).limit(400),
      ]);
      if (!alive) return;
      if (m.error || r.error || s.error) { setSync("offline"); setLoaded(true); return; }
      const mm: Record<string, Machine> = {};
      (m.data as Machine[]).forEach((x) => (mm[x.slug] = x));
      const ss: Record<string, Session> = {};
      (s.data as Session[]).forEach((x) => (ss[x.date] = { ...x, client_updated_at: Number(x.client_updated_at) || 0 }));
      // lo editado sin conexión gana si es más nuevo
      const pending: Record<string, Session> = lsGet(K.p) || {};
      Object.values(pending).forEach((p) => { if ((ss[p.date]?.client_updated_at || 0) < p.client_updated_at) ss[p.date] = p; });
      setMachines(mm); setRoutines(r.data as Routine[]); setSessions(ss);
      lsSet(K.m, mm); lsSet(K.r, r.data); lsSet(K.s, ss);
      setSync("ok"); setLoaded(true);
      flushPending();
    })().catch(() => { setSync("offline"); setLoaded(true); });
    const onOnline = () => flushPending();
    window.addEventListener("online", onOnline);
    const iv = setInterval(() => { const k = keyOf(new Date()); setTodayKey((prev) => (prev !== k ? k : prev)); }, 60000);
    return () => { alive = false; window.removeEventListener("online", onOnline); clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /* ---- sesión de hoy ---- */
  const routineBySlug = useMemo(() => Object.fromEntries(routines.map((r) => [r.slug, r])), [routines]);
  const buildToday = useCallback((rk: string | null, base?: Session | null): Session | null => {
    const t: Session = base ? structuredClone(base) : { date: todayKey, routine_slug: rk, items: {}, client_updated_at: 0 };
    if (rk) t.routine_slug = rk;
    const r = t.routine_slug ? routineBySlug[t.routine_slug] : null;
    if (r) r.items.forEach((def) => { if (!t.items[def.m]) t.items[def.m] = freshItem(def, sessions, machines[def.m], todayKey); });
    return t;
  }, [todayKey, routineBySlug, sessions, machines]);

  useEffect(() => {
    if (!routines.length) return;
    const cur = todayRef.current;
    if (cur && cur.date === todayKey && (sessions[todayKey]?.client_updated_at || 0) <= cur.client_updated_at) return;
    const base = sessions[todayKey] || null;
    const rk = base?.routine_slug ?? routineForDay(routines, parseKey(todayKey))?.slug ?? null;
    const t = buildToday(rk, base);
    todayRef.current = t; setToday(t); setOpen(null);
  }, [routines, sessions, todayKey, buildToday]);

  /* ---- guardado ---- */
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  function markPending(t: Session) { const p = lsGet(K.p) || {}; p[t.date] = t; lsSet(K.p, p); }
  function clearPending(date: string, stamp: number) { const p = lsGet(K.p) || {}; if (p[date] && p[date].client_updated_at <= stamp) { delete p[date]; lsSet(K.p, p); } }
  async function push(t: Session) {
    const { error } = await supabase.from("sessions").upsert(
      { user_id: uid, date: t.date, routine_slug: t.routine_slug, items: t.items, client_updated_at: t.client_updated_at },
      { onConflict: "user_id,date" }
    );
    if (error) throw error;
    clearPending(t.date, t.client_updated_at);
  }
  async function flushPending() {
    const p: Record<string, Session> = lsGet(K.p) || {};
    const list = Object.values(p);
    if (!list.length) return;
    setSync("busy");
    try { for (const t of list) await push(t); setSync("ok"); } catch { setSync(navigator.onLine ? "error" : "offline"); }
  }
  function commit(t: Session) {
    t.client_updated_at = Date.now();
    todayRef.current = t; setToday(t);
    setSessions((s) => { const n = { ...s, [t.date]: t }; lsSet(K.s, n); return n; });
    markPending(t); setSync("busy");
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => flushPending(), 700);
  }
  function mutate(fn: (t: Session) => void) {
    if (!todayRef.current) return;
    const t = structuredClone(todayRef.current);
    fn(t); commit(t);
  }
  async function setMachineUnit(slug: string, unit: Unit) {
    setMachines((m) => { const n = { ...m, [slug]: { ...m[slug], unit } }; lsSet(K.m, n); return n; });
    await supabase.from("machines").update({ unit }).eq("slug", slug);
  }

  /* ---- descanso ---- */
  const [rest, setRest] = useState<{ end: number; total: number; label: string } | null>(null);
  const wake = useRef<any>(null);
  const closeRest = useCallback(() => setRest(null), []);
  async function startRest(sec: number, label: string) {
    unlockAudio();
    try { if (!wake.current && (navigator as any).wakeLock) { wake.current = await (navigator as any).wakeLock.request("screen"); wake.current.addEventListener?.("release", () => (wake.current = null)); } } catch {}
    setRest({ end: Date.now() + sec * 1000, total: sec, label });
  }

  /* ---- acciones ---- */
  const curRoutine = today?.routine_slug ? routineBySlug[today.routine_slug] : null;
  const nextUndone = (t: Session) => curRoutine?.items.find((d) => !itemDone(d, t.items[d.m])) || null;
  function chooseRoutine(slug: string) {
    const t = buildToday(slug, todayRef.current && todayRef.current.date === todayKey ? todayRef.current : sessions[todayKey]);
    if (t) commit(t);
    setOpen(null); setPicking(false); setTab("hoy"); window.scrollTo(0, 0);
  }
  function step(m: string, f: "w" | "reps" | "secs" | "min", i: number, dir: 1 | -1) {
    mutate((t) => {
      const it = t.items[m];
      if (f === "w") {
        const u = unitOf(it), st = it.sets![i];
        setW(st, u, Math.max(0, Math.round(((wIn(st, u) ?? 0) + dir * (u === "lb" ? 5 : 2.5)) * 10) / 10));
        it.sets!.forEach((x, j) => { if (j > i && !x.done) setW(x, u, wIn(st, u)); });
      } else if (f === "min") it.min = Math.max(0, (it.min ?? 0) + dir);
      else { const st = it.sets![i] as any; st[f] = Math.max(0, (st[f] ?? 0) + dir * (f === "secs" ? 5 : 1)); }
    });
  }
  function typed(m: string, f: "w" | "reps" | "secs" | "min", i: number, raw: string) {
    const v = parseNum(raw); const val = v == null ? null : Math.max(0, v);
    mutate((t) => {
      const it = t.items[m];
      if (f === "w") { const u = unitOf(it); setW(it.sets![i], u, val); it.sets!.forEach((x, j) => { if (j > i && !x.done) setW(x, u, val); }); }
      else if (f === "min") it.min = val;
      else (it.sets![i] as any)[f] = val;
    });
  }
  function toggleSet(def: ItemDef, i: number) {
    let after: Session | null = null;
    mutate((t) => { const s = t.items[def.m].sets![i]; s.done = !s.done; after = t; });
    const t = todayRef.current!; const it = t.items[def.m];
    if (!it.sets![i].done) return;
    if (it.sets!.every((x) => x.done)) {
      const nx = nextUndone(t);
      setOpen(nx ? nx.m : "");
      if (nx) setTimeout(() => document.getElementById("card-" + nx.m)?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
      startRest(def.rest || 60, nx ? `Descanso · luego ${nx.label || machines[nx.m]?.name}` : "Último descanso");
    } else startRest(def.rest || 60, `Descanso · serie ${i + 2} de ${it.sets!.length}`);
    void after;
  }
  function toggleCardio(def: ItemDef) {
    mutate((t) => { const it = t.items[def.m]; it.done = !it.done; });
    const t = todayRef.current!;
    if (t.items[def.m].done) { const nx = nextUndone(t); setOpen(nx ? nx.m : ""); }
  }
  function setUnit(def: ItemDef, u: Unit) {
    mutate((t) => { t.items[def.m].unit = u; });
    setMachineUnit(def.m, u);
  }

  const effectiveOpen = open ?? (today && curRoutine ? nextUndone(today)?.m ?? "" : "");

  /* ---- vistas ---- */
  const syncPill = (() => {
    const map: Record<Sync, [string, string]> = { busy: ["busy", "Guardando…"], ok: ["", "Guardado"], offline: ["local", "Sin señal: guardado en el teléfono"], error: ["local", "No se pudo guardar, reintentando"] };
    const [c, t] = map[sync];
    return <span className={`sync ${c}`}><i />{t}</span>;
  })();

  function Header({ title, eyebrow, children }: { title: string; eyebrow: string; children?: React.ReactNode }) {
    return (
      <header className="top">
        <div className="top-row"><div className="eyebrow">{eyebrow}</div>{syncPill}</div>
        {children ?? <h1>{title}</h1>}
      </header>
    );
  }

  function Picker({ current }: { current: string | null }) {
    return (
      <div className="picker">
        {routines.map((r) => (
          <button key={r.slug} type="button" className={r.slug === current ? "on" : ""} onClick={() => chooseRoutine(r.slug)}>
            {r.name}<span>{r.weekdays.map((x) => DAYS[x].slice(0, 3)).join(" · ")}</span>
          </button>
        ))}
      </div>
    );
  }

  function Prev({ def }: { def: ItemDef }) {
    const last = lastFor(sessions, def.m, todayKey);
    if (!last) return <div className="prev">Primera vez que registras este ejercicio. Anota el peso con el que partes.</div>;
    const it = last.it;
    let line = "", hint: string | null = null;
    if (def.k === "hold") line = (it.sets || []).filter((x) => x.done).map((x) => x.secs + " s").join(" · ");
    else {
      const ds = (it.sets || []).filter((x) => x.done);
      const u = unitOf(it);
      const best = ds.reduce<any>((a, x) => ((x.kg || 0) > (a?.kg || 0) ? x : a), null);
      const kg = best?.kg || 0;
      line = `${kg ? fmtW(best.kg, best.lb, u) + " × " : ""}${ds.map((x) => x.reps).join(", ")} reps`;
      const top = def.reps![1];
      if (kg && (it.feel === "facil" || (ds.length >= (def.sets || 3) && ds.every((x) => (x.reps || 0) >= top))))
        hint = `Te costó poco: prueba ${u === "lb" ? fmtW(null, (best.lb ?? toLb(kg)) + 5, "lb") : fmtW(kg + 2.5, null, "kg")} hoy.`;
    }
    return (
      <div className="prev">
        <span>Anterior · {shortDate(last.date)}: <b className="num">{line}</b>{it.feel ? ` · ${feelName(it.feel)}` : ""}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
    );
  }

  function Card({ def }: { def: ItemDef }) {
    const it = today!.items[def.m] as ItemLog; const m = machines[def.m];
    if (!it || !m) return null;
    const done = itemDone(def, it), isOpen = effectiveOpen === def.m;
    const img = `/machines/${def.m}.jpg`;
    const isHold = def.k === "hold";
    const u = unitOf(it), o: Unit = u === "lb" ? "kg" : "lb";
    const wsub = (st: any) => { const v = wIn(st, u); return v == null ? u : `${u} · ${fmtNum(u === "lb" ? toKg(v) : toLb(v))} ${o}`; };
    const holdCols = { gridTemplateColumns: "26px 1fr 48px" };
    return (
      <section className={`card ${done ? "done" : ""}`} id={`card-${def.m}`}>
        <button type="button" className="head" aria-expanded={isOpen}
          onClick={() => { setOpen(isOpen ? "" : def.m); setTimeout(() => document.getElementById("card-" + def.m)?.scrollIntoView({ block: "start", behavior: "smooth" }), 30); }}>
          <img className="thumb" src={img} alt="" />
          <div><div className="name">{def.label || m.name}</div><div className="meta">{targetText(def)}</div></div>
          {done ? <span className="tick" aria-label="Hecho">✓</span> : def.k === "cardio" ? <span /> :
            <span className="dots">{it.sets!.map((s, i) => <i key={i} className={s.done ? "on" : ""} />)}</span>}
        </button>
        {isOpen && (
          <div className="body">
            <img className="photo" src={img} alt={m.name} />
            <p className="how">{m.how_to}</p>
            {def.k === "cardio" ? (
              <>
                <div className="setrow" style={{ gridTemplateColumns: "1fr" }}><Stepper id={`in-${def.m}-min`} value={it.min} label="minutos" onStep={(d) => step(def.m, "min", 0, d)} onTyped={(r) => typed(def.m, "min", 0, r)} /></div>
                <button type="button" className={`big ${it.done ? "okk" : ""}`} onClick={() => toggleCardio(def)}>{it.done ? "Hecho ✓" : "Marcar como hecho"}</button>
              </>
            ) : (
              <>
                {Prev({ def })}
                <div className="colhead" style={isHold ? holdCols : undefined}>
                  <span>Serie</span>
                  {isHold ? <span>segundos</span> : (
                    <span className="utog" role="group" aria-label="Unidad de peso">
                      {(["lb", "kg"] as Unit[]).map((x) => (
                        <button key={x} type="button" className={u === x ? "on" : ""} aria-pressed={u === x} onClick={() => setUnit(def, x)}>{x}</button>
                      ))}
                    </span>
                  )}
                  {!isHold && <span>reps</span>}
                  <span>Hecha</span>
                </div>
                <div className="sets">
                  {it.sets!.map((s, i) => (
                    <div className="setrow" key={i} style={isHold ? holdCols : undefined}>
                      <span className="lbl">{i + 1}</span>
                      {isHold ? <Stepper id={`in-${def.m}-secs-${i}`} value={s.secs} label="seg" onStep={(d) => step(def.m, "secs", i, d)} onTyped={(r) => typed(def.m, "secs", i, r)} /> : (
                        <>
                          <Stepper id={`in-${def.m}-w-${i}`} value={wIn(s, u)} label={u} sub={wsub(s)} onStep={(d) => step(def.m, "w", i, d)} onTyped={(r) => typed(def.m, "w", i, r)} />
                          <Stepper id={`in-${def.m}-reps-${i}`} value={s.reps} label="reps" onStep={(d) => step(def.m, "reps", i, d)} onTyped={(r) => typed(def.m, "reps", i, r)} />
                        </>
                      )}
                      <button type="button" className={`check ${s.done ? "on" : ""}`} aria-label={`Serie ${i + 1} hecha`} aria-pressed={s.done} onClick={() => toggleSet(def, i)}>✓</button>
                    </div>
                  ))}
                </div>
                <div className="feel" role="group" aria-label="Sensación">
                  {FEELS.map(([k, l]) => (
                    <button key={k} type="button" className={it.feel === k ? "on" : ""} onClick={() => mutate((t) => { const x = t.items[def.m]; x.feel = x.feel === k ? null : k; })}>{l}</button>
                  ))}
                </div>
                <NoteInput id={`note-${def.m}`} value={it.note || ""} onSave={(v) => mutate((t) => { t.items[def.m].note = v; })} />
              </>
            )}
          </div>
        )}
      </section>
    );
  }

  function Hoy() {
    const d = parseKey(todayKey);
    const eyebrow = `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
    if (!loaded && !routines.length) return Header({ title: "Cargando…", eyebrow });
    const r = curRoutine;
    const total = r ? r.items.length : 0;
    const done = r && today ? r.items.filter((def) => itemDone(def, today.items[def.m])).length : 0;
    const head = (
      Header({ title: "", eyebrow, children: <>
        <div className="top-row"><h1>{r ? r.name : "Día de descanso"}</h1>
          <button className="chip-btn" type="button" onClick={() => setPicking(!picking)}>{picking ? "Cerrar" : "Cambiar"}</button></div>
        {r && <div className="prog"><div className="bar"><b style={{ width: `${total ? (100 * done) / total : 0}%` }} /></div><span className="num">{done} de {total}</span></div>}
      </> })
    );
    if (!r || !today) return <>{head}<div className="empty">Hoy toca descansar. Si igual vas al gimnasio, elige qué rutina harás.</div>{Picker({ current: null })}</>;
    const isWarm = (x: ItemDef) => x.label === "Calentamiento";
    const isFin = (x: ItemDef) => r.type !== "cardio" && x.k === "cardio" && !isWarm(x);
    const warm = r.items.filter(isWarm), fin = r.items.filter(isFin), main = r.items.filter((x) => !isWarm(x) && !isFin(x));
    return (
      <>
        {head}
        {picking && Picker({ current: r.slug })}
        <div className="list">{warm.map((x) => <Fragment key={x.m}>{Card({ def: x })}</Fragment>)}</div>
        <h2 className="sect">{r.type === "cardio" ? "Cardio y core · 3 vueltas" : "Ejercicios"}</h2>
        <div className="list">{main.map((x) => <Fragment key={x.m}>{Card({ def: x })}</Fragment>)}</div>
        {fin.length > 0 && <><h2 className="sect">Cierre</h2><div className="list">{fin.map((x) => <Fragment key={x.m}>{Card({ def: x })}</Fragment>)}</div>
          <p className="meta" style={{ margin: "8px 2px 0" }}>Después: elongación 5 min.</p></>}
        <details className="food"><summary>Alimentación e hidratación <span className="meta">{r.type === "cardio" ? "día cardio" : "día fuerza"}</span></summary>
          <ul>{FOOD[r.type].map(([t, x]) => <li key={t}><b>{t}</b><span>{x}</span></li>)}</ul></details>
      </>
    );
  }

  function Spark({ pts }: { pts: { v: number }[] }) {
    if (pts.length < 2) return <svg className="spark" viewBox="0 0 110 36"><circle cx="100" cy="18" r="3.5" fill="var(--accent)" /></svg>;
    const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
    const xy = pts.map((p, i) => [6 + i * (98 / (pts.length - 1)), 30 - ((p.v - lo) / span) * 24]);
    const d = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const l = xy[xy.length - 1];
    return (
      <svg className="spark" viewBox="0 0 110 36" aria-hidden="true">
        <path d={`${d} L${l[0].toFixed(1)} 34 L6 34 Z`} fill="var(--accent-soft)" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={l[0].toFixed(1)} cy={l[1].toFixed(1)} r="3.5" fill="var(--accent)" />
      </svg>
    );
  }

  function Progreso() {
    const keys = Object.keys(sessions).sort();
    const nowD = new Date(); const monday = new Date(nowD); monday.setDate(nowD.getDate() - ((nowD.getDay() + 6) % 7)); const mk = keyOf(monday);
    let wk = 0, vol = 0, total = 0;
    keys.forEach((k) => {
      const s = sessions[k]; const any = Object.values(s.items || {}).some((it) => it.done || it.sets?.some((x) => x.done)); if (!any) return; total++;
      if (k >= mk) { wk++; Object.values(s.items).forEach((it) => it.sets?.forEach((x) => { if (x.done && x.kg && x.reps) vol += x.kg * x.reps; })); }
    });
    const rows = Object.keys(machines).map((m) => ({
      m, pts: keys.map((k) => { const mt = metricOf(sessions[k].items?.[m]); return mt ? { k, ...mt, it: sessions[k].items[m] } : null; }).filter(Boolean) as any[],
    })).filter((r) => r.pts.length).sort((a, b) => (a.pts[a.pts.length - 1].k < b.pts[b.pts.length - 1].k ? 1 : -1));
    return (
      <>
        {Header({ title: "Progreso", eyebrow: "Tu progreso" })}
        <div className="stats">
          <div className="stat"><div className="v">{wk}</div><div className="k">sesiones esta semana</div></div>
          <div className="stat"><div className="v">{vol ? Math.round(vol).toLocaleString("es-CL") : "0"}</div><div className="k">kg movidos esta semana</div></div>
          <div className="stat"><div className="v">{total}</div><div className="k">sesiones en total</div></div>
        </div>
        {!rows.length ? <div className="empty">Aún no hay registros. Cuando marques tu primera serie en <b>Hoy</b>, aquí verás cómo sube el peso de cada máquina.</div> : (
          <div className="list">{rows.map(({ m, pts }) => {
            const last = pts[pts.length - 1], bp = pts.reduce((a: any, p: any) => (p.v > a.v ? p : a), pts[0]), isOpen = progOpen === m;
            const show = (p: any) => (p.u === "kg" ? fmtW(p.v, p.lb, last.unit) : `${fmtNum(p.v)} ${p.u}`);
            return (
              <section className="card" key={m}>
                <button type="button" className="prow" aria-expanded={isOpen} onClick={() => setProgOpen(isOpen ? null : m)}>
                  <div><div className="name">{machines[m].name}</div><div className="meta num">Última {show(last)} · mejor {show(bp)} · {pts.length} {pts.length === 1 ? "vez" : "veces"}</div></div>
                  {Spark({ pts: pts.slice(-12) })}
                </button>
                {isOpen && <div className="hist">{pts.slice().reverse().slice(0, 15).map((p: any) => (
                  <div key={p.k}><span>{shortDate(p.k)}</span><span className="num">{p.u === "kg" ? fmtW(p.v, p.lb, p.unit) + " × " + p.reps.join(", ") : fmtNum(p.v) + " " + p.u}{p.it.feel ? " · " + feelName(p.it.feel) : ""}{p.it.note ? " · " + p.it.note : ""}</span></div>
                ))}</div>}
              </section>
            );
          })}</div>
        )}
      </>
    );
  }

  function Plan() {
    const todayIdx = new Date().getDay();
    return (
      <>
        {Header({ title: "Plan", eyebrow: "Semana tipo" })}
        <div className="list">{[1, 2, 3, 4, 5, 6, 0].map((di) => {
          const r = routineForDay(routines, new Date(2026, 0, 4 + di)); const isOpen = planOpen === di; // 4 ene 2026 = domingo
          return (
            <section className="card" key={di}>
              <button type="button" className={`day ${di === todayIdx ? "today" : ""}`} aria-expanded={isOpen} onClick={() => setPlanOpen(isOpen ? null : di)}>
                <span className="d">{DAYS[di].slice(0, 3)}</span>
                <span><span className="name">{r ? r.name : "Descanso"}</span>{r && <div className="meta">{r.duration_min} min</div>}</span>
                <span className="meta">{r ? (isOpen ? "▴" : "▾") : ""}</span>
              </button>
              {isOpen && r && <>
                <ol className="plist">{r.items.map((x, i) => <li key={i}>{x.label || machines[x.m]?.name} <span>· {targetText(x)}</span></li>)}</ol>
                <div style={{ padding: "0 12px 12px" }}><button type="button" className="big ghost" onClick={() => chooseRoutine(r.slug)}>Hacer esta rutina hoy</button></div>
              </>}
            </section>
          );
        })}</div>
        <p className="meta" style={{ margin: "18px 2px 0" }}>
          <button type="button" className="linkbtn" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="wrap">{tab === "hoy" ? Hoy() : tab === "prog" ? Progreso() : Plan()}</div>
      <div className="dock">
        {rest && <RestBar rest={rest} onClose={closeRest} onPlus={() => setRest({ ...rest, end: Math.max(rest.end, Date.now()) + 30000, total: rest.total + 30 })} />}
        <nav className="tabs" aria-label="Secciones">
          {([["hoy", "Hoy", <path key="a" d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />],
             ["prog", "Progreso", <path key="b" d="M3 17l6-6 4 4 8-8M15 7h6v6" />],
             ["plan", "Plan", <g key="c"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></g>]] as const).map(([k, l, icon]) => (
            <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); setPicking(false); window.scrollTo(0, 0); }}>
              <svg viewBox="0 0 24 24">{icon}</svg>{l}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
