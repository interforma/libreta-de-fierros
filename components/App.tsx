"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { EMPTY_PROFILE, type Discomfort, type Profile } from "@/lib/health";
import { CheckupList, DiscomfortList, DiscomfortSheet, ProfileCard, type Checkup } from "@/components/Perfil";
import {
  DAYS, MONTHS, FEELS, FOOD, feelName, fmtNum, fmtW, freshItem, itemDone, keyOf, lastFor, metricOf, mmss,
  parseKey, parseNum, routineForDay, setW, shortDate, targetText, toKg, toLb, unitOf, wIn,
  activeBlock, weekOf, blockEnd, isDeload, routinesOf, repsOf,
  type Block, type ItemDef, type ItemLog, type Machine, type Routine, type Session, type Unit,
} from "@/lib/logic";
import { getPrefs, savePrefs, SIZES, THEMES, type Prefs } from "@/lib/prefs";
import { callCoach, shrinkPhoto } from "@/lib/coachClient";
import { flushPhotos, progressPath, queueAll, queueDel, queuePut, uploadOne } from "@/lib/progressPhotos";
import { GuidePanel, MachineCatalog, PhotoSheet } from "@/components/Maquinas";
import Punto from "@/components/Punto";

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
function Stepper({ id, value, label, sub, stepLabel, onStep, onTyped }: { id: string; value: number | null | undefined; label: string; sub?: string; stepLabel?: string; onStep: (dir: 1 | -1) => void; onTyped: (raw: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="step">
      <button type="button" className={stepLabel ? "lbl" : ""} aria-label={`Bajar ${label}${stepLabel ? ` ${stepLabel}` : ""}`} onClick={() => onStep(-1)}>−{stepLabel ?? ""}</button>
      <div className="unit">
        <input className="num" id={id} inputMode="decimal" placeholder="—" aria-label={label}
          value={draft ?? fmtNum(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft != null) { onTyped(draft); setDraft(null); } }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <small>{sub ?? label}</small>
      </div>
      <button type="button" className={stepLabel ? "lbl" : ""} aria-label={`Subir ${label}${stepLabel ? ` ${stepLabel}` : ""}`} onClick={() => onStep(1)}>+{stepLabel ?? ""}</button>
    </div>
  );
}
function NoteInput({ id, value, onSave, placeholder = "Nota: asiento 4, agarre ancho…" }: { id: string; value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="note" id={id} placeholder={placeholder} value={v}
    onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v.slice(0, 200)); }} />;
}
/* Temporizador de trabajo: cardio (minutos) y ejercicios de aguante (segundos). Cuenta hacia atrás y avisa al terminar. */
type Work = { m: string; i: number; end: number; total: number; label: string; paused?: number };
function WorkBar({ work, onPlus, onFinish, onCancel, onPause }: { work: Work; onPlus: () => void; onFinish: (early: boolean) => void; onCancel: () => void; onPause: () => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => { fired.current = false; setNow(Date.now()); const iv = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(iv); }, [work]);
  const left = work.paused != null ? work.paused : Math.ceil((work.end - now) / 1000);
  useEffect(() => {
    if (work.paused == null && left <= 0 && !fired.current) { fired.current = true; beep(); onFinish(false); }
  }, [left, work.paused, onFinish]);
  const isCardio = work.i < 0;
  return (
    <div className="timer work" role="timer" aria-live="off">
      <div className="fill" style={{ width: `${100 * (1 - Math.max(0, left) / work.total)}%` }} />
      <div className="t">{mmss(Math.max(0, left))}</div>
      <div className="l">{work.paused != null ? "En pausa · " : ""}{work.label}</div>
      <div className="btns three">
        <button type="button" onClick={onPause}>{work.paused != null ? "Seguir" : "Pausa"}</button>
        <button type="button" onClick={onPlus}>{isCardio ? "+1 min" : "+10 s"}</button>
        <button type="button" className="go" onClick={() => onFinish(true)}>Terminar</button>
      </div>
      <button type="button" className="cancel" onClick={onCancel}>Cancelar sin registrar</button>
    </div>
  );
}

type Rest = { end: number; total: number; label: string; water?: boolean };
function RestBar({ rest, onPlus, onClose }: { rest: Rest; onPlus: () => void; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => { fired.current = false; setNow(Date.now()); const iv = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(iv); }, [rest]);
  const left = Math.ceil((rest.end - now) / 1000);
  useEffect(() => {
    if (left <= 0 && !fired.current) { fired.current = true; beep(); }
    if (left < -20) onClose();
  }, [left, onClose]);
  return (
    <div className={`timer ${left <= 0 ? "end" : "has-punto"}`} role="timer" aria-live="off">
      <div className="fill" style={{ width: `${left <= 0 ? 100 : 100 * (1 - left / rest.total)}%` }} />
      {left > 0 && <Punto expr="atento" size={44} alive />}
      <div className="t">{left <= 0 ? "0:00" : mmss(left)}</div>
      <div className="l">{left <= 0 ? "Listo: a la siguiente serie" : rest.label}
        {rest.water && left > 0 && <span className="water">Toma unos sorbos de agua (150–250 ml)</span>}</div>
      <div className="btns">
        <button type="button" onClick={onPlus}>+30 segundos</button>
        <button type="button" className="go" onClick={onClose}>{left <= 0 ? "Cerrar" : "Saltar descanso"}</button>
      </div>
    </div>
  );
}
let actx: AudioContext | null = null;
function unlockAudio() { try { actx = actx || new (window.AudioContext || (window as any).webkitAudioContext)(); actx.resume?.(); } catch {} }
function beep() {
  const pr = getPrefs();
  try {
    const a = pr.sound ? actx : null; if (a) [0, 0.22, 0.44].forEach((t) => {
      const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination);
      g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.3, a.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.18); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.2);
    });
  } catch {}
  try { if (pr.vibrate) navigator.vibrate?.([300, 120, 300]); } catch {}
}

/* ---------- rutas de IA (entrenador) ---------- */
type Balance = { text: string; done: number; planned: number; at: string; tips?: Record<string, string> };
const COSTS: [string, string][] = [["nada", "Nada"], ["registrar", "Registrar las series"], ["maquina", "Alguna máquina"], ["cansancio", "Terminar la rutina"]];

/* ===================================================================== */
type Sync = "busy" | "ok" | "offline" | "error";

function Logbook({ uid }: { uid: string }) {
  const K = { m: `lf.${uid}.machines`, r: `lf.${uid}.routines`, s: `lf.${uid}.sessions`, p: `lf.${uid}.pending` };
  const [machines, setMachines] = useState<Record<string, Machine>>(() => lsGet(K.m) || {});
  const [routines, setRoutines] = useState<Routine[]>(() => lsGet(K.r) || []);
  const [blocks, setBlocks] = useState<Block[]>(() => lsGet(`lf.${uid}.blocks`) || []);
  const [checkups, setCheckups] = useState<Checkup[]>(() => lsGet(`lf.${uid}.checkups`) || []);
  const [planBlock, setPlanBlock] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, Session>>(() => lsGet(K.s) || {});
  const [todayKey, setTodayKey] = useState(() => keyOf(new Date()));
  const [today, setToday] = useState<Session | null>(null);
  const todayRef = useRef<Session | null>(null);
  const [tab, setTab] = useState<"hoy" | "prog" | "plan" | "perfil">("hoy");
  const [profile, setProfile] = useState<Profile>(() => lsGet(`lf.${uid}.profile`) || EMPTY_PROFILE);
  const [discomforts, setDiscomforts] = useState<Discomfort[]>(() => lsGet(`lf.${uid}.discomforts`) || []);
  const [sheet, setSheet] = useState<string | null | undefined>(undefined); // undefined = cerrado, null = sin ejercicio
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [progOpen, setProgOpen] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState<number | null>(null);
  const [sync, setSync] = useState<Sync>("busy");
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(() => getPrefs());
  const [balances, setBalances] = useState<Record<string, Balance>>(() => lsGet(`lf.${uid}.balance`) || {});
  const [busyBalance, setBusyBalance] = useState(false);
  const [balanceErr, setBalanceErr] = useState<string | null>(null);
  const [coach, setCoach] = useState<{ busy: boolean; err: string | null }>({ busy: false, err: null });
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  /* ---- fotos propias de las máquinas (Storage privado: URLs firmadas por una semana) ---- */
  useEffect(() => {
    const need = Object.values(machines).filter((m) => m.photo_path && !photoUrls[m.photo_path]).map((m) => m.photo_path!) ;
    if (!need.length || !navigator.onLine) return;
    supabase.storage.from("machine-photos").createSignedUrls(need, 7 * 24 * 3600).then(({ data }) => {
      if (!data) return;
      setPhotoUrls((u) => { const n = { ...u }; data.forEach((d) => { if (d.path && d.signedUrl) n[d.path] = d.signedUrl; }); return n; });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines]);
  const photoUrl = (m: Machine) => (m.photo_path && photoUrls[m.photo_path]) || `/machines/${m.slug}.jpg`;
  function putMachine(m: Machine) {
    setMachines((all) => { const n = { ...all, [m.slug]: { ...all[m.slug], ...m } }; lsSet(K.m, n); return n; });
  }
  const setGuide = (slug: string, guide: string) => putMachine({ ...machines[slug], guide });

  /* ---- fotos de progreso por máquina ---- */
  const [localPhotos, setLocalPhotos] = useState<Record<string, string>>({}); // ruta → URL local (fotos recién sacadas o pendientes)
  const [viewer, setViewer] = useState<{ src: string; caption: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  useEffect(() => {
    queueAll().then((q) => setLocalPhotos((l) => { const n = { ...l }; Object.entries(q).forEach(([k, b]) => { if (!n[k]) n[k] = URL.createObjectURL(b); }); return n; }));
    flushPhotos();
    const on = () => flushPhotos();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);
  useEffect(() => {
    // URLs firmadas para las fotos guardadas en el servidor (las locales ya se ven)
    const need = Object.values(sessions).flatMap((x) => Object.values(x.items || {}).flatMap((it: any) => (Array.isArray(it?.photos) ? it.photos : [])))
      .filter((p: string) => !photoUrls[p] && !localPhotos[p]);
    if (!need.length || !navigator.onLine) return;
    supabase.storage.from("machine-photos").createSignedUrls(need.slice(0, 100), 7 * 24 * 3600).then(({ data }) => {
      if (!data) return;
      setPhotoUrls((u) => { const n = { ...u }; data.forEach((d) => { if (d.path && d.signedUrl) n[d.path] = d.signedUrl; }); return n; });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, tab]);
  const photoSrc = (p: string) => localPhotos[p] || photoUrls[p] || "";
  async function addPhoto(m: string, f: File | undefined) {
    if (!f || !todayRef.current) return;
    setPhotoBusy(m);
    try {
      const { blob } = await shrinkPhoto(f, 1280);
      const path = progressPath(uid, todayRef.current.date, m);
      await queuePut(path, blob);
      setLocalPhotos((l) => ({ ...l, [path]: URL.createObjectURL(blob) }));
      mutate((t) => { const it = t.items[m]; it.photos = [...(it.photos || []), path]; track(t, "foto"); });
      if (navigator.onLine) uploadOne(path, blob).catch(() => {});
    } catch {}
    setPhotoBusy(null);
  }
  function removePhoto(m: string, path: string) {
    mutate((t) => { const it = t.items[m]; it.photos = (it.photos || []).filter((x) => x !== path); });
    queueDel(path);
    supabase.storage.from("machine-photos").remove([path]).catch(() => {});
  }
  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => { const n = { ...prefs, [k]: v }; setPrefsState(n); savePrefs(n); };

  /* ---- carga inicial ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      await supabase.rpc("seed_defaults");
      await supabase.rpc("seed_block_one");
      const [m, r, s, b] = await Promise.all([
        supabase.from("machines").select("slug,name,muscle_group,how_to,unit,settings,photo_path,guide,guide_at,source"),
        supabase.from("routines").select("slug,name,type,weekdays,duration_min,items,position,block_id").order("position"),
        supabase.from("sessions").select("date,routine_slug,items,client_updated_at").order("date", { ascending: false }).limit(400),
        supabase.from("blocks").select("id,name,start_date,weeks,deload_week,focus,balance").order("start_date"),
      ]);
      if (!alive) return;
      if (m.error || r.error || s.error || b.error) { setSync("offline"); setLoaded(true); return; }
      setBlocks(b.data as Block[]); lsSet(`lf.${uid}.blocks`, b.data);
      // el balance guardado en el servidor manda: así se ve igual en cualquier teléfono
      setBalances((prev) => { const n = { ...prev }; (b.data as Block[]).forEach((x) => { if (x.balance) n[x.id] = x.balance; }); lsSet(`lf.${uid}.balance`, n); return n; });
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
      const [pf, ds, ck] = await Promise.all([
        supabase.from("profiles").select("*").maybeSingle(),
        supabase.from("discomforts").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(100),
        supabase.from("checkups").select("*").order("date", { ascending: false }).limit(100),
      ]);
      if (alive && !ck.error) { setCheckups(ck.data as Checkup[]); lsSet(`lf.${uid}.checkups`, ck.data); }
      if (alive && !pf.error) { const v = { ...EMPTY_PROFILE, ...(pf.data || {}) } as Profile; setProfile(v); lsSet(`lf.${uid}.profile`, v); }
      if (alive && !ds.error) { setDiscomforts(ds.data as Discomfort[]); lsSet(`lf.${uid}.discomforts`, ds.data); }
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
    if (r) r.items.forEach((def) => { if (!t.items[def.m]) t.items[def.m] = freshItem(def, sessions, machines[def.m], todayKey, blocks); });
    return t;
  }, [todayKey, routineBySlug, sessions, machines, blocks]);

  useEffect(() => {
    if (!routines.length) return;
    const cur = todayRef.current;
    if (cur && cur.date === todayKey && (sessions[todayKey]?.client_updated_at || 0) <= cur.client_updated_at) return;
    const base = sessions[todayKey] || null;
    const rk = base?.routine_slug ?? routineForDay(routines, parseKey(todayKey), blocks)?.slug ?? null;
    const t = buildToday(rk, base);
    todayRef.current = t; setToday(t); setOpen(null);
  }, [routines, blocks, sessions, todayKey, buildToday]);

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
    const meta = t.items as any;
    if (!meta.__t0) meta.__t0 = Date.now();
    fn(t);
    const r = t.routine_slug ? routineBySlug[t.routine_slug] : null;
    if (r && !meta.__t1 && r.items.every((d) => itemDone(d, t.items[d.m]))) meta.__t1 = Date.now();
    commit(t);
  }
  // Registro silencioso de fricción: cuántas veces se deshace, se cambia de unidad o se escribe a mano.
  function track(t: Session, k: string) { const u = ((t.items as any).__uso ||= {}); u[k] = (u[k] || 0) + 1; }
  async function setMachineUnit(slug: string, unit: Unit) {
    setMachines((m) => { const n = { ...m, [slug]: { ...m[slug], unit } }; lsSet(K.m, n); return n; });
    await supabase.from("machines").update({ unit }).eq("slug", slug);
  }

  /* ---- descanso ---- */
  const [rest, setRest] = useState<Rest | null>(null);
  const lastWater = useRef(0);
  const wake = useRef<any>(null);
  const closeRest = useCallback(() => setRest(null), []);
  async function keepAwake() {
    try { if (!wake.current && (navigator as any).wakeLock) { wake.current = await (navigator as any).wakeLock.request("screen"); wake.current.addEventListener?.("release", () => (wake.current = null)); } } catch {}
  }
  async function startRest(sec: number, label: string) {
    unlockAudio();
    await keepAwake();
    const now = Date.now();
    if (!lastWater.current) lastWater.current = Number((todayRef.current?.items as any)?.__t0) || now;
    const water = now - lastWater.current > 18 * 60000;
    if (water) lastWater.current = now;
    setRest({ end: now + sec * 1000, total: sec, label, water });
  }

  /* ---- perfil y molestias ---- */
  async function saveProfile(p: Profile) {
    const { user_id, updated_at, ...rest } = p as any;
    const { data, error } = await supabase.from("profiles").upsert({ ...rest, user_id: uid }).select().single();
    const v = { ...EMPTY_PROFILE, ...(error ? p : data) } as Profile;
    setProfile(v); lsSet(`lf.${uid}.profile`, v);
  }
  function upsertDiscomfort(d: Discomfort) {
    setDiscomforts((list) => { const n = [d, ...list.filter((x) => x.id !== d.id)].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); lsSet(`lf.${uid}.discomforts`, n); return n; });
  }
  const activeFor = (m: string) => discomforts.find((d) => !d.resolved && d.machine_slug === m);
  const SUPL = "__suplementos";
  function toggleSupl(name: string) {
    mutate((t) => { const x = ((t.items as any)[SUPL] ||= {}); x[name] = !x[name]; });
  }

  /* ---- acciones ---- */
  const curRoutine = today?.routine_slug ? routineBySlug[today.routine_slug] : null;
  const curRoutineRef = useRef(curRoutine); curRoutineRef.current = curRoutine;
  const curBlock = activeBlock(blocks, todayKey);
  const deloadNow = isDeload(blocks, todayKey);
  /* sugerencia del balance del bloque anterior: aparece solo la primera vez que toca el ejercicio en el bloque nuevo */
  const prevBlock = curBlock ? blocks.filter((b) => b.start_date < curBlock.start_date).slice(-1)[0] : undefined;
  /** ¿Hubo un logro real hoy? Subió el peso respecto de la vez anterior o completó el tope del rango en todas las series. */
  function sessionWin(defs: ItemDef[]): boolean {
    if (!today || deloadNow) return false;
    return defs.some((def) => {
      const it = today.items[def.m]; const ds = it?.sets?.filter((x) => x.done) || [];
      if (!ds.length || def.k === "hold" || def.k === "cardio") return false;
      const best = Math.max(...ds.map((x) => x.kg || 0));
      const last = lastFor(sessions, def.m, todayKey, (k) => isDeload(blocks, k));
      const prev = last ? Math.max(0, ...(last.it.sets || []).filter((x) => x.done).map((x) => x.kg || 0)) : 0;
      if (prev && best > prev + 0.01) return true;
      const top = def.reps?.[1];
      return !!top && ds.length >= (def.sets || 3) && ds.every((x) => (x.reps || 0) >= top);
    });
  }
  function carryTip(m: string): string | null {
    if (!curBlock || !prevBlock) return null;
    const tip = prevBlock.balance?.tips?.[m] ?? balances[prevBlock.id]?.tips?.[m];
    if (!tip) return null;
    const usedBefore = Object.values(sessions).some((s) => s.date >= curBlock.start_date && s.date < todayKey && (s.items[m]?.done || s.items[m]?.sets?.some((x) => x.done)));
    return usedBefore ? null : tip;
  }
  const nextUndone = (t: Session) => curRoutine?.items.find((d) => !itemDone(d, t.items[d.m])) || null;
  function chooseRoutine(slug: string) {
    const t = buildToday(slug, todayRef.current && todayRef.current.date === todayKey ? todayRef.current : sessions[todayKey]);
    if (t) { track(t, "cambio_rutina"); commit(t); }
    setOpen(null); setPicking(false); setTab("hoy"); window.scrollTo(0, 0);
  }
  function step(m: string, f: "w" | "reps" | "secs" | "min" | "tandas", i: number, dir: 1 | -1) {
    mutate((t) => {
      const it = t.items[m];
      if (f === "w") {
        const u = unitOf(it), st = it.sets![i];
        setW(st, u, Math.max(0, Math.round(((wIn(st, u) ?? 0) + dir * (u === "lb" ? 5 : 2.5)) * 10) / 10));
        it.sets!.forEach((x, j) => { if (j > i && !x.done) setW(x, u, wIn(st, u)); });
      } else if (f === "min") it.min = Math.max(0, (it.min ?? 0) + dir);
      else if (f === "tandas") {
        const v = Math.min(6, Math.max(1, (it.sets![i].tandas || 1) + dir));
        it.sets!.forEach((x, j) => { if (j === i || (j > i && !x.done)) { x.tandas = v; x.tdone = Math.min(x.tdone || 0, v - 1); } });
      }
      else { const st = it.sets![i] as any; st[f] = Math.max(0, (st[f] ?? 0) + dir * (f === "secs" ? 5 : 1)); }
    });
  }
  function typed(m: string, f: "w" | "reps" | "secs" | "min" | "tandas", i: number, raw: string) {
    const v = parseNum(raw); const val = v == null ? null : Math.max(0, v);
    mutate((t) => {
      const it = t.items[m];
      if (f === "w") { const u = unitOf(it); setW(it.sets![i], u, val); it.sets!.forEach((x, j) => { if (j > i && !x.done) setW(x, u, val); }); track(t, "peso_escrito"); }
      else if (f === "min") it.min = val;
      else if (f === "tandas") { const v = Math.min(6, Math.max(1, Math.round(val || 1))); it.sets!.forEach((x, j) => { if (j === i || (j > i && !x.done)) { x.tandas = v; x.tdone = Math.min(x.tdone || 0, v - 1); } }); }
      else { (it.sets![i] as any)[f] = val; track(t, f === "reps" ? "reps_escritas" : "segundos_escritos"); }
    });
  }
  function toggleSet(def: ItemDef, i: number) {
    let after: Session | null = null;
    const cur = todayRef.current?.items[def.m]?.sets?.[i];
    const nT = cur?.tandas || 1, tdone = cur?.tdone || 0;
    // Pirámide: con varias tandas, cada toque marca una tanda y lanza el descanso; la última cierra la serie.
    if (cur && !cur.done && nT > 1 && tdone < nT - 1) {
      mutate((t) => { t.items[def.m].sets![i].tdone = tdone + 1; });
      startRest(def.rest || 60, `Descanso · luego tanda ${tdone + 2} de ${nT} (serie ${i + 1})`);
      return;
    }
    mutate((t) => { const s = t.items[def.m].sets![i]; if (s.done) { track(t, "deshacer_serie"); s.tdone = 0; } else if (nT > 1) s.tdone = nT; s.done = !s.done; after = t; });
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
    mutate((t) => { const it = t.items[def.m]; if (it.done) track(t, "deshacer_cardio"); it.done = !it.done; });
    const t = todayRef.current!;
    if (t.items[def.m].done) { const nx = nextUndone(t); setOpen(nx ? nx.m : ""); }
  }
  /* ---- temporizador de trabajo ---- */
  const [work, setWork] = useState<Work | null>(null);
  const workRef = useRef<Work | null>(null);
  useEffect(() => { workRef.current = work; }, [work]);
  function startWork(def: ItemDef, i: number) {
    unlockAudio(); keepAwake(); setRest(null);
    const it = todayRef.current?.items[def.m]; const name = def.label || machines[def.m]?.name || "";
    const sec = i < 0 ? Math.max(1, it?.min ?? def.min ?? 10) * 60 : Math.max(5, it?.sets?.[i]?.secs ?? def.secs ?? 30);
    setWork({ m: def.m, i, end: Date.now() + sec * 1000, total: sec, label: i < 0 ? `${name} · ${Math.round(sec / 60)} min` : `${name} · serie ${i + 1}` });
  }
  const finishWork = useCallback((early: boolean) => {
    const w = workRef.current; if (!w) return;
    setWork(null); workRef.current = null;
    const left = w.paused != null ? w.paused : Math.max(0, Math.ceil((w.end - Date.now()) / 1000));
    const did = early ? Math.max(0, w.total - left) : w.total;
    const def = curRoutineRef.current?.items.find((d) => d.m === w.m);
    if (!def) return;
    if (w.i < 0) {
      const min = Math.max(1, Math.round(did / 60));
      mutate((t) => { const it = t.items[w.m]; it.min = min; if (!it.done) { it.done = true; track(t, early ? "temporizador_terminado_antes" : "temporizador_completo"); } });
      const nx = todayRef.current ? nextUndone(todayRef.current) : null; setOpen(nx ? nx.m : "");
      if (nx) setTimeout(() => document.getElementById("card-" + nx.m)?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
    } else {
      mutate((t) => { const st = t.items[w.m].sets?.[w.i]; if (st) st.secs = Math.max(1, did); track(t, early ? "temporizador_terminado_antes" : "temporizador_completo"); });
      if (!todayRef.current?.items[w.m]?.sets?.[w.i]?.done) toggleSet(def, w.i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function pauseWork() {
    setWork((w) => {
      if (!w) return w;
      if (w.paused != null) return { ...w, end: Date.now() + w.paused * 1000, paused: undefined };
      return { ...w, paused: Math.max(0, Math.ceil((w.end - Date.now()) / 1000)) };
    });
  }
  function plusWork() {
    setWork((w) => {
      if (!w) return w;
      const add = w.i < 0 ? 60 : 10;
      return w.paused != null ? { ...w, paused: w.paused + add, total: w.total + add } : { ...w, end: Math.max(w.end, Date.now()) + add * 1000, total: w.total + add };
    });
  }

  function setUnit(def: ItemDef, u: Unit) {
    mutate((t) => { t.items[def.m].unit = u; track(t, "cambio_unidad"); });
    setMachineUnit(def.m, u);
  }

  function applyWeight(m: string, u: Unit, v: number) {
    mutate((t) => { const it = t.items[m]; it.sets?.forEach((x) => { if (!x.done) setW(x, u, v); }); track(t, "uso_sugerencia"); });
  }

  /* ---- cierre de sesión: comentario del entrenador ---- */
  const todayComplete = !!(curRoutine && today && curRoutine.items.length && curRoutine.items.every((d) => itemDone(d, today.items[d.m])));
  const coachAsked = useRef<string | null>(null);
  async function askCoach() {
    setCoach({ busy: true, err: null });
    try {
      if (todayRef.current) { markPending(todayRef.current); await flushPending(); }
      const j = await callCoach<{ text: string }>("/api/resumen", { date: todayKey });
      mutate((t) => { (t.items as any).__resumen = { text: j.text, at: Date.now() }; });
      setCoach({ busy: false, err: null });
    } catch (e: any) { setCoach({ busy: false, err: e.message }); }
  }
  useEffect(() => {
    if (!todayComplete || !today || (today.items as any).__resumen || coachAsked.current === todayKey || !navigator.onLine) return;
    coachAsked.current = todayKey;
    const id = setTimeout(() => { askCoach(); }, 1200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayComplete, todayKey]);
  function setCost(k: string) { mutate((t) => { const c = ((t.items as any).__cierre ||= {}); c.costo = c.costo === k ? null : k; c.at = Date.now(); }); }

  /* ---- balance del bloque ---- */
  async function askBalance(blockId: string) {
    setBusyBalance(true); setBalanceErr(null);
    try {
      const j = await callCoach<Balance>("/api/balance", { block_id: blockId });
      setBalances((b) => { const n = { ...b, [blockId]: j }; lsSet(`lf.${uid}.balance`, n); return n; });
      setBlocks((bs) => { const n = bs.map((x) => (x.id === blockId ? { ...x, balance: j } : x)); lsSet(`lf.${uid}.blocks`, n); return n; });
    } catch (e: any) { setBalanceErr(e.message); }
    setBusyBalance(false);
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
        {routinesOf(routines, curBlock?.id).map((r) => (
          <button key={r.slug} type="button" className={r.slug === current ? "on" : ""} onClick={() => chooseRoutine(r.slug)}>
            {r.name}<span>{r.weekdays.map((x) => DAYS[x].slice(0, 3)).join(" · ")}</span>
          </button>
        ))}
      </div>
    );
  }

  function Prev({ def }: { def: ItemDef }) {
    const last = lastFor(sessions, def.m, todayKey, (k) => isDeload(blocks, k));
    if (!last) return <div className="prev"><span><b>Primera vez:</b> {def.k === "hold" ? "anota cuántos segundos aguantas con buena técnica." : `elige un peso con el que puedas hacer ${def.reps?.[1] ?? 12} repeticiones con buena técnica. Lo usaremos como punto de partida.`}</span></div>;
    const it = last.it;
    let line = "", hint: string | null = null, sugg: { u: Unit; v: number; t: string } | null = null;
    if (def.k === "hold") line = (it.sets || []).filter((x) => x.done).map((x) => x.secs + " s").join(" · ");
    else {
      const ds = (it.sets || []).filter((x) => x.done);
      const u = unitOf(it);
      const best = ds.reduce<any>((a, x) => ((x.kg || 0) > (a?.kg || 0) ? x : a), null);
      const kg = best?.kg || 0;
      line = `${kg ? fmtW(best.kg, best.lb, u) + " × " : ""}${ds.map(repsOf).join(", ")} reps`;
      const top = def.reps![1];
      if (kg && !deloadNow && (it.feel === "facil" || (ds.length >= (def.sets || 3) && ds.every((x) => (x.reps || 0) >= top))))
      {
        const v = u === "lb" ? (best.lb ?? toLb(kg)!) + 5 : kg + 2.5;
        const t = u === "lb" ? fmtW(null, v, "lb") : fmtW(v, null, "kg");
        hint = `La vez anterior te costó poco: hoy puedes subir a ${t}.`;
        sugg = { u, v, t: `${fmtNum(v)} ${u}` };
      }
    }
    return (
      <div className="prev">
        <span>Anterior · {shortDate(last.date)}: <b className="num">{line}</b>{it.feel ? ` · ${feelName(it.feel)}` : ""}</span>
        {hint && <span className="hint">{hint}</span>}
        {sugg && (() => {
          const cur = today?.items[def.m];
          const pending = cur?.sets?.filter((x) => !x.done) || [];
          const already = !pending.length || pending.every((x) => (wIn(x, sugg!.u) ?? 0) >= sugg!.v - 0.01);
          return already ? null : <button type="button" className="suggest" onClick={() => applyWeight(def.m, sugg!.u, sugg!.v)}>Usar {sugg!.t} en las series</button>;
        })()}
      </div>
    );
  }

  function Card({ def }: { def: ItemDef }) {
    const it = today!.items[def.m] as ItemLog; const m = machines[def.m];
    if (!it || !m) return null;
    const done = itemDone(def, it), isOpen = effectiveOpen === def.m;
    const img = photoUrl(m);
    const isHold = def.k === "hold";
    const u = unitOf(it), o: Unit = u === "lb" ? "kg" : "lb";
    const conv = (st: any) => { const v = wIn(st, u); return v == null || v === 0 ? "\u00a0" : `equivale a ${fmtNum(u === "lb" ? toKg(v) : toLb(v))} ${o}`; };
    const nDone = it.sets ? it.sets.filter((x) => x.done).length : 0;
    const okIcon = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
    const carry = !it.tip_seen ? carryTip(def.m) : null;
    return (
      <section className={`card ${done ? "done" : ""}`} id={`card-${def.m}`}>
        <button type="button" className="head" aria-expanded={isOpen}
          onClick={() => { setOpen(isOpen ? "" : def.m); setTimeout(() => document.getElementById("card-" + def.m)?.scrollIntoView({ block: "start", behavior: "smooth" }), 30); }}>
          <img className="thumb" src={img} alt="" />
          <div><div className="name">{def.label || m.name}</div><div className="meta">{targetText(it.sets ? { ...def, sets: it.sets.length } : def)}</div>{carry && !done && <div className="carrymark">Tiene una nota del balance</div>}</div>
          {done ? <span className="tick">{okIcon}Hecho</span> : def.k === "cardio" ? <span /> :
            <span className="count">{nDone} de {it.sets!.length}</span>}
        </button>
        {isOpen && (
          <div className="body">
            {carry && (
              <div className="tip carry">
                <b>Del balance del {prevBlock!.name}</b>
                <span>{carry}</span>
                <button type="button" className="linkbtn" onClick={() => mutate((s) => { s.items[def.m].tip_seen = true; })}>Entendido, ocultar</button>
              </div>
            )}
            {def.note && <p className="tip">{def.note}</p>}
            <p className="how">{m.how_to}</p>
            <details className="photo-toggle">
              <summary>Ver foto de la máquina</summary>
              <img className="photo" src={img} alt={m.name} />
            </details>
            <GuidePanel machine={m} onGuide={setGuide} />
            {activeFor(def.m) && (() => { const a = activeFor(def.m)!; return (
              <button type="button" className="alert warn" onClick={() => setTab("perfil")}>
                <b>Molestia activa: {a.area.toLowerCase()}{a.side ? ` ${a.side}` : ""} · {a.intensity}/10</b>
                <span>Registrada el {shortDate(a.date)}. {a.advice ? "Toca para ver la orientación." : "Baja la carga si vuelve a aparecer."}</span>
              </button>); })()}
            {def.k === "cardio" ? (
              <>
                <div className="fld"><span>Minutos</span><Stepper id={`in-${def.m}-min`} value={it.min} label="minutos" onStep={(d) => step(def.m, "min", 0, d)} onTyped={(r) => typed(def.m, "min", 0, r)} /></div>
                {!it.done && (work?.m === def.m
                  ? <div className="running">Temporizador en marcha: míralo abajo</div>
                  : <button type="button" className="big" onClick={() => startWork(def, -1)}>Iniciar temporizador de {fmtNum(it.min ?? def.min ?? 10)} min</button>)}
                <button type="button" className={`big ${it.done ? "okk" : "ghost"}`} onClick={() => toggleCardio(def)}>{it.done ? "Hecho · tocar para deshacer" : "Ya lo hice: marcar como hecho"}</button>
              </>
            ) : (
              <>
                {Prev({ def })}
                {!isHold && (
                  <div className="ublock">
                    <span className="lab">Esta máquina marca el peso en</span>
                    <div className="seg" role="group" aria-label="Unidad de esta máquina">
                      {([["lb", "Libras (lb)"], ["kg", "Kilos (kg)"]] as [Unit, string][]).map(([x, l]) => (
                        <button key={x} type="button" className={u === x ? "on" : ""} aria-pressed={u === x} onClick={() => setUnit(def, x)}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="sets">
                  {it.sets!.map((s, i) => (
                    <div className={`setcard ${s.done ? "on" : ""}`} key={i}>
                      <div className="set-top">
                        <h3>Serie {i + 1} de {it.sets!.length}</h3>
                        {s.done && <span className="tick">{okIcon}Hecha</span>}
                      </div>
                      {isHold ? (
                        <div className="fields one"><div className="fld"><span>Segundos</span>
                          <Stepper id={`in-${def.m}-secs-${i}`} value={s.secs} label="segundos" stepLabel="5" onStep={(d) => step(def.m, "secs", i, d)} onTyped={(r) => typed(def.m, "secs", i, r)} /></div>
                          {!s.done && (work?.m === def.m && work.i === i
                            ? <div className="running">Temporizador en marcha: míralo abajo</div>
                            : <button type="button" className="big ghost" onClick={() => startWork(def, i)}>Iniciar temporizador de {s.secs ?? def.secs ?? 30} s</button>)}
                        </div>
                      ) : (
                        <div className="fields">
                          <div className="fld"><span>Peso</span>
                            <Stepper id={`in-${def.m}-w-${i}`} value={wIn(s, u)} label={`peso en ${u}`} sub={u} stepLabel={u === "lb" ? "5" : "2,5"} onStep={(d) => step(def.m, "w", i, d)} onTyped={(r) => typed(def.m, "w", i, r)} />
                            <span className="conv num">{conv(s)}</span></div>
                          <div className="fld"><span>{(s.tandas || 1) > 1 ? "Reps por tanda" : "Repeticiones"}</span>
                            <Stepper id={`in-${def.m}-reps-${i}`} value={s.reps} label="repeticiones" sub="reps" onStep={(d) => step(def.m, "reps", i, d)} onTyped={(r) => typed(def.m, "reps", i, r)} /></div>
                          <div className="fld tandas"><span>Tandas con este peso</span>
                            <Stepper id={`in-${def.m}-tandas-${i}`} value={s.tandas || 1} label="tandas" sub={(s.tandas || 1) > 1 ? `= ${(s.reps || 0) * (s.tandas || 1)} reps` : "tanda"} onStep={(d) => step(def.m, "tandas", i, d)} onTyped={(r) => typed(def.m, "tandas", i, r)} /></div>
                        </div>
                      )}
                      {!s.done && (s.tdone || 0) > 0 && <div className="tdots" aria-label={`${s.tdone} de ${s.tandas} tandas hechas`}>{Array.from({ length: s.tandas || 1 }, (_, k) => <i key={k} className={k < (s.tdone || 0) ? "on" : ""} />)}<span>{s.tdone} de {s.tandas} tandas</span></div>}
                      <button type="button" className={`check ${s.done ? "on" : ""}`} aria-pressed={s.done} onClick={() => toggleSet(def, i)}>
                        {s.done ? "Deshacer" : (s.tandas || 1) > 1 && (s.tdone || 0) < (s.tandas || 1) - 1
                          ? <>{okIcon}Marcar tanda {(s.tdone || 0) + 1} de {s.tandas}</>
                          : <>{okIcon}Marcar serie {i + 1} como hecha</>}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="fld"><span>¿Cómo te sentiste?</span>
                  <div className="feel" role="group" aria-label="Sensación">
                    {FEELS.map(([k, l]) => (
                      <button key={k} type="button" className={it.feel === k ? "on" : ""} aria-pressed={it.feel === k} onClick={() => mutate((t) => { const x = t.items[def.m]; x.feel = x.feel === k ? null : k; })}>{l}</button>
                    ))}
                  </div>
                </div>
                <NoteInput id={`note-${def.m}`} value={it.note || ""} onSave={(v) => mutate((t) => { t.items[def.m].note = v; })} />
                <div className="pphotos">
                  {(it.photos || []).map((p) => (
                    <div className="pthumb" key={p}>
                      <button type="button" className="pimg" aria-label="Ver foto" onClick={() => setViewer({ src: photoSrc(p), caption: `${m.name} · hoy` })}>{photoSrc(p) && <img src={photoSrc(p)} alt="" />}</button>
                      <button type="button" className="pdel" aria-label="Quitar foto" onClick={() => removePhoto(def.m, p)}>×</button>
                    </div>
                  ))}
                  <label className="pcam">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                    <span>{photoBusy === def.m ? "Guardando…" : (it.photos || []).length ? "Otra foto" : "Foto de hoy"}</span>
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhoto(def.m, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </div>
                <button type="button" className="linkbtn" onClick={() => setSheet(def.m)}>¿Te molestó algo? Registrar molestia</button>
              </>
            )}
          </div>
        )}
      </section>
    );
  }

  function BlockLine() {
    if (!curBlock) return null;
    const w = weekOf(curBlock, todayKey), past = w > curBlock.weeks;
    const next = blocks.find((b) => b.start_date > todayKey);
    const soon = next && (parseKey(next.start_date).getTime() - parseKey(todayKey).getTime()) / 864e5 <= 7;
    return (
      <>
        <div className="blk num">{curBlock.name} · {past ? `terminó (semana ${w})` : `semana ${w} de ${curBlock.weeks}`}</div>
        {soon && next && <div className="blk-next">{next.name} empieza el {shortDate(next.start_date)}</div>}
        {(w >= curBlock.weeks) && !balances[curBlock.id] && (
          <button type="button" className="propose" onClick={() => { setPlanBlock(curBlock.id); setTab("plan"); window.scrollTo(0, 0); }}>
            <b>{curBlock.name} {past ? "terminó" : "termina esta semana"}</b><span>Mira tu balance antes de empezar el siguiente: qué avanzó y qué conviene cuidar.</span>
          </button>
        )}
        {deloadNow && <div className="alert warn" style={{ marginTop: 8 }}><b>Semana de descarga</b><span>Una serie menos y cerca del 60 % del peso. La idea es recuperarse, no exigirse: termina cada serie con varias repeticiones de sobra.</span></div>}
        {past && !next && <div className="alert warn" style={{ marginTop: 8 }}><b>Bloque cumplido</b><span>Es buen momento para planificar el siguiente bloque.</span></div>}
      </>
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
          <button className="chip-btn" type="button" aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? "Cerrar" : "Cambiar rutina"}</button></div>
        {BlockLine()}
        {r && <div className="prog">
          <div className="prog-row"><b>{done} de {total} hechos</b>{r.duration_min ? <span className="meta" style={{ margin: 0 }}>unos {r.duration_min} min</span> : null}</div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Avance de la rutina"><b style={{ width: `${total ? (100 * done) / total : 0}%` }} /></div>
        </div>}
      </> })
    );
    if (!r || !today) return <>{head}<div className="empty">Hoy toca descansar. Si igual vas al gimnasio, elige qué rutina harás.</div>{Picker({ current: null })}</>;
    const isWarm = (x: ItemDef) => x.label === "Calentamiento";
    const isFin = (x: ItemDef) => r.type !== "cardio" && x.k === "cardio" && !isWarm(x);
    const warm = r.items.filter(isWarm), fin = r.items.filter(isFin), main = r.items.filter((x) => !isWarm(x) && !isFin(x));
    const meta = today.items as any;
    const started = r.items.some((d) => { const it = today.items[d.m]; return it?.done || it?.sets?.some((x) => x.done); });
    const mins = meta.__t0 && meta.__t1 ? Math.round((meta.__t1 - meta.__t0) / 60000) : null;
    const di = FOOD[r.type].findIndex(([t]) => t === "Durante");
    const post = di >= 0 ? FOOD[r.type][di + 1] : null; // lo que va justo después de entrenar
    const close = done === total && total > 0 && (
      <section className="card closecard" aria-live="polite">
        <div className="eyebrow">Sesión completa{mins && mins < 300 ? ` · ${mins} min` : ""}</div>
        <div className="coach">
          {(() => {
            // Punto solo aparece cuando el entrenador está diciendo algo; celebra solo si hubo un logro real.
            const expr = meta.__resumen?.text ? (sessionWin(r.items) ? "celebra" : "atento") : coach.busy ? "piensa" : coach.err ? "uy" : null;
            return (
              <div className="who-row">
                {expr && <Punto key={expr} expr={expr} size={36} alive={expr === "piensa"} />}
                <span className="who">Tu entrenador</span>
              </div>
            );
          })()}
          {meta.__resumen?.text ? <p>{meta.__resumen.text}</p>
            : coach.busy ? <p className="meta">Preparando un comentario sobre tu sesión…</p>
            : <>
                {coach.err && <p className="msg">{coach.err}</p>}
                <button type="button" className="big ghost" onClick={askCoach}>Pedir comentario de la sesión</button>
              </>}
        </div>
        {post && <div className="nudge"><b>En la próxima hora</b><span>{post[1]}</span></div>}
        <div className="fld"><span>¿Algo te costó hoy?</span>
          <div className="chips" role="group" aria-label="¿Algo te costó hoy?">
            {COSTS.map(([k, l]) => <button key={k} type="button" className={meta.__cierre?.costo === k ? "on" : ""} aria-pressed={meta.__cierre?.costo === k} onClick={() => setCost(k)}>{l}</button>)}
          </div>
          {meta.__cierre?.costo && meta.__cierre.costo !== "nada" && (
            <NoteInput id="cierre-nota" placeholder="¿Qué pasó? (opcional)" value={meta.__cierre?.nota || ""} onSave={(v) => mutate((t) => { ((t.items as any).__cierre ||= {}).nota = v; })} />
          )}
          {meta.__cierre?.costo && <span className="meta">Anotado. Con esto vamos mejorando la app.</span>}
        </div>
      </section>
    );
    return (
      <>
        {head}
        {close}
        {!started && <div className="nudge" style={{ marginTop: 14 }}><b>Antes de empezar</b><span>Unos 250 ml de agua, y ten la botella a mano.</span></div>}
        {picking && Picker({ current: r.slug })}
        <div className="list">{warm.map((x) => <Fragment key={x.m}>{Card({ def: x })}</Fragment>)}</div>
        <h2 className="sect">{r.type === "cardio" ? "Cardio y core · 3 vueltas" : "Ejercicios"}</h2>
        <div className="list">{main.map((x) => <Fragment key={x.m}>{Card({ def: x })}</Fragment>)}</div>
        {fin.length > 0 && <><h2 className="sect">Cierre</h2><div className="list">{fin.map((x) => <Fragment key={x.m}>{Card({ def: x })}</Fragment>)}</div>
          <p className="meta" style={{ margin: "8px 2px 0" }}>Después: elongación 5 min.</p></>}
        {(profile.supplements.length > 0) && (
          <div className="supl-today">
            <h2 className="sect" style={{ marginTop: 0 }}>Suplementos de hoy</h2>
            <div className="chips">{profile.supplements.filter((s) => s.name).map((s) => {
              const on = !!(today.items as any)[SUPL]?.[s.name];
              return <button key={s.name} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => toggleSupl(s.name)}>{on ? "✓ " : ""}{s.name.split(" ")[0]} · {s.dose.split(" (")[0]}</button>;
            })}</div>
          </div>
        )}
        <button type="button" className="big ghost" style={{ marginTop: 14 }} onClick={() => setPhotoSheet(true)}>¿Una máquina que no conoces? Sácale una foto</button>
        <button type="button" className="big ghost" style={{ marginTop: 10 }} onClick={() => setSheet(null)}>Registrar una molestia o dolor</button>
        <details className="food"><summary>Alimentación e hidratación <span className="meta">{r.type === "cardio" ? "día cardio" : "día fuerza"}</span></summary>
          <ul>{FOOD[r.type].map(([t, x]) => <li key={t}><b>{t}</b><span>{x}</span></li>)}</ul></details>
      </>
    );
  }

  function Spark({ pts }: { pts: { v: number }[] }) {
    if (pts.length < 2) return <svg className="spark" viewBox="0 0 110 36"><circle cx="100" cy="18" r="4" fill="var(--accent-text)" /></svg>;
    const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
    const xy = pts.map((p, i) => [6 + i * (98 / (pts.length - 1)), 30 - ((p.v - lo) / span) * 24]);
    const d = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const l = xy[xy.length - 1];
    return (
      <svg className="spark" viewBox="0 0 110 36" aria-hidden="true">
        <path d={`${d} L${l[0].toFixed(1)} 34 L6 34 Z`} fill="var(--accent-soft)" />
        <path d={d} fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={l[0].toFixed(1)} cy={l[1].toFixed(1)} r="4" fill="var(--accent-text)" />
      </svg>
    );
  }

  const sessionDone = (k: string) => { const ss = sessions[k]; return !!ss && Object.values(ss.items || {}).some((it) => it.done || it.sets?.some((x) => x.done)); };
  const thisWeek = () => {
    const nowD = parseKey(todayKey); const monday = new Date(nowD); monday.setDate(nowD.getDate() - ((nowD.getDay() + 6) % 7));
    return [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return { k: keyOf(d), di: d.getDay() }; });
  };

  function Progreso() {
    const keys = Object.keys(sessions).sort();
    const week = thisWeek(), mk = week[0].k;
    const plan = routinesOf(routines, curBlock?.id);
    const hasRoutine = (di: number) => plan.some((r) => r.weekdays.includes(di));
    const planned = week.filter((w) => hasRoutine(w.di)).length;
    let wk = 0, total = 0;
    keys.forEach((k) => { if (!sessionDone(k)) return; total++; if (k >= mk) wk++; });
    const rows = Object.keys(machines).map((m) => ({
      m, pts: keys.map((k) => { const mt = metricOf(sessions[k].items?.[m]); return mt ? { k, ...mt, it: sessions[k].items[m] } : null; }).filter(Boolean) as any[],
    })).filter((r) => r.pts.length).sort((a, b) => (a.pts[a.pts.length - 1].k < b.pts[b.pts.length - 1].k ? 1 : -1));
    return (
      <>
        {Header({ title: "Progreso", eyebrow: "Tu progreso" })}
        <section className="card" style={{ padding: 14, marginTop: 14 }}>
          <div className="stats two" style={{ marginTop: 0 }}>
            <div className="stat"><div className="v">{wk} <small>de {planned || "—"}</small></div><div className="k">sesiones esta semana</div></div>
            <div className="stat"><div className="v">{total}</div><div className="k">sesiones en total</div></div>
          </div>
          <div className="week" role="img" aria-label={`Esta semana: ${wk} de ${planned} sesiones hechas`}>
            {week.map((w) => <i key={w.k} className={sessionDone(w.k) ? "ok" : w.k === todayKey ? "today" : !hasRoutine(w.di) ? "rest" : ""} />)}
          </div>
          <div className="weekl" aria-hidden="true">{week.map((w) => <span key={w.k} className={w.k === todayKey ? "today" : ""}>{w.k === todayKey ? "Hoy" : DAYS[w.di].slice(0, 3)}</span>)}</div>
        </section>
        {!rows.length ? <div className="empty">Aún no hay registros. Cuando marques tu primera serie en <b>Hoy</b>, aquí verás cómo sube el peso de cada máquina.</div> : (
          <>
          <h2 className="sect">Tus pesos</h2>
          <p className="meta" style={{ margin: "4px 2px 0" }}>En la unidad de cada máquina, con la equivalencia entre paréntesis.</p>
          <div className="list">{rows.map(({ m, pts }) => {
            const last = pts[pts.length - 1], bp = pts.reduce((a: any, p: any) => (p.v > a.v ? p : a), pts[0]), isOpen = progOpen === m;
            const unit: Unit = machines[m]?.unit || last.unit || "kg";
            const show = (p: any) => (p.u === "kg" ? fmtW(p.v, p.lb, unit) : `${fmtNum(p.v)} ${p.u}`);
            // registro raro: mucho más que lo habitual o, si es el primero, mucho más que el peso corporal
            const prevMax = pts.slice(0, -1).filter((p: any) => p.u === "kg").reduce((a: number, p: any) => Math.max(a, p.v), 0);
            const odd = last.u === "kg" && (prevMax ? last.v > prevMax * 1.6 : !!profile.weight_kg && last.v > Number(profile.weight_kg) * 2.5);
            return (
              <section className="card" key={m}>
                <button type="button" className="prow" aria-expanded={isOpen} onClick={() => setProgOpen(isOpen ? null : m)}>
                  <div>
                    <div className="name">{machines[m].name}</div>
                    <div className="pval num">{show(last)}</div>
                    <div className="meta num">{pts.length === 1 ? "Primer registro" : `Mejor ${show(bp)} · ${pts.length} veces`}</div>
                    {odd && <span className="flag">Revisar</span>}
                  </div>
                  {Spark({ pts: pts.slice(-12) })}
                </button>
                {isOpen && <div className="hist">
                  {odd && <span className="warnline">Este registro es mucho mayor de lo habitual. Revisa que la unidad (lb o kg) esté bien elegida en la máquina.</span>}
                  {(() => {
                    const gal = keys.slice().reverse().flatMap((k) => (sessions[k].items?.[m]?.photos || []).map((ph: string) => ({ k, ph, mt: metricOf(sessions[k].items[m]) as any })));
                    if (!gal.length) return null;
                    return (
                      <div className="gallery" aria-label={`Fotos de ${machines[m].name}`}>
                        {gal.slice(0, 24).map(({ k, ph, mt }) => {
                          const cap = `${shortDate(k)}${mt?.u === "kg" ? " · " + fmtW(mt.v, mt.lb, unit) : ""}`;
                          return (
                            <button type="button" key={ph} className="gitem" onClick={() => setViewer({ src: photoSrc(ph), caption: `${machines[m].name} · ${cap}` })}>
                              {photoSrc(ph) ? <img src={photoSrc(ph)} alt="" loading="lazy" /> : <span className="ph" />}
                              <span className="gcap num">{shortDate(k)}</span>
                              {mt?.u === "kg" && <span className="gcap num">{fmtW(mt.v, mt.lb, unit)}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {pts.slice().reverse().slice(0, 15).map((p: any) => (
                    <div key={p.k}><span>{shortDate(p.k)}</span><span className="num">{p.u === "kg" ? fmtW(p.v, p.lb, unit) + " × " + p.reps.join(", ") : fmtNum(p.v) + " " + p.u}{p.it.feel ? " · " + feelName(p.it.feel) : ""}{p.it.note ? " · " + p.it.note : ""}</span></div>
                  ))}</div>}
              </section>
            );
          })}</div>
          </>
        )}
      </>
    );
  }

  function upsertCheckup(c: Checkup) {
    const v = [c, ...checkups.filter((x) => x.id !== c.id)].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    setCheckups(v); lsSet(`lf.${uid}.checkups`, v);
    // el peso del control más reciente pasa al perfil
    if (c.weight_kg != null && v[0].id === c.id && Number(c.weight_kg) !== Number(profile.weight_kg)) saveProfile({ ...profile, weight_kg: Number(c.weight_kg) });
  }
  function removeCheckup(id: string) {
    const v = checkups.filter((x) => x.id !== id); setCheckups(v); lsSet(`lf.${uid}.checkups`, v);
  }

  function PerfilView() {
    const active = discomforts.filter((d) => !d.resolved);
    return (
      <>
        {Header({ title: "Perfil", eyebrow: "Tú y tu salud" })}
        <h2 className="sect">Para ver mejor</h2>
        <section className="card settings" style={{ marginTop: 10 }}>
          <div>
            <div className="lab">Tamaño de letra</div>
            <div className="seg three" role="group" aria-label="Tamaño de letra">
              {SIZES.map(([k, l], i) => (
                <button key={k} type="button" aria-pressed={prefs.size === k} onClick={() => setPref("size", k)}>
                  <span className="num" style={{ fontSize: [16, 22, 28][i], fontWeight: 600, lineHeight: 1 }} aria-hidden="true">A</span><small>{l}</small>
                </button>
              ))}
            </div>
            <div className="preview" aria-hidden="true"><div className="name">Press inclinado máquina</div><div className="meta">3 series de 10 a 12 reps · descanso 1:30</div></div>
          </div>
          <div>
            <div className="lab">Colores de la pantalla</div>
            <div className="seg three" role="group" aria-label="Colores de la pantalla">
              {THEMES.map(([k, l]) => <button key={k} type="button" aria-pressed={prefs.theme === k} onClick={() => setPref("theme", k)}>{l}</button>)}
            </div>
            <p className="meta" style={{ margin: "8px 0 0" }}>"Claro" se lee mejor con la luz del gimnasio.</p>
          </div>
          <div>
            {([["vibrate", "Vibrar", "Al terminar el descanso"], ["sound", "Sonido", "Un aviso corto al terminar el descanso"]] as const).map(([k, l, h]) => (
              <div className="toggle" key={k}>
                <div><div className="name">{l}</div><div className="meta">{h}</div></div>
                <button type="button" role="switch" className="switch" aria-checked={prefs[k]} aria-label={l} onClick={() => setPref(k, !prefs[k])}><i /></button>
              </div>
            ))}
          </div>
        </section>
        <h2 className="sect">Tus datos</h2>
        <div className="list" style={{ marginTop: 10 }}><ProfileCard profile={profile} onSave={saveProfile} /></div>
        <h2 className="sect">Máquinas de tu gimnasio</h2>
        <MachineCatalog uid={uid} machines={machines} photoUrl={photoUrl} onGuide={setGuide} onSaved={(m) => putMachine(m)} onAdd={() => setPhotoSheet(true)} />
        <h2 className="sect">Controles con profesionales</h2>
        <CheckupList items={checkups} onSaved={upsertCheckup} onDeleted={removeCheckup} />
        <h2 className="sect">Molestias {active.length ? `· ${active.length} activa${active.length > 1 ? "s" : ""}` : ""}</h2>
        <button type="button" className="big ghost" style={{ marginTop: 10 }} onClick={() => setSheet(null)}>Registrar una molestia o dolor</button>
        <DiscomfortList items={discomforts} machines={machines} onChange={upsertDiscomfort} />
        <p className="meta" style={{ margin: "14px 2px 0" }}>La orientación es una guía de entrenamiento, no un diagnóstico. Ante dolor fuerte, persistente o que te preocupe, consulta con un kinesiólogo o médico.</p>
      </>
    );
  }

  function Plan() {
    const sel = blocks.find((b) => b.id === planBlock) || curBlock || blocks[blocks.length - 1] || null;
    const list = sel ? routinesOf(routines, sel.id) : routines;
    const status = (b: Block) => (b.start_date > todayKey ? "próximo" : b.id === curBlock?.id ? "actual" : "anterior");
    const canDo = !sel || sel.id === curBlock?.id;
    return (
      <>
        {Header({ title: "Plan", eyebrow: sel ? `${sel.name} · ${status(sel)}` : "Semana tipo" })}
        {blocks.length > 1 && (
          <div className="picker blocks" role="group" aria-label="Bloques">
            {blocks.map((b) => (
              <button key={b.id} type="button" className={b.id === sel?.id ? "on" : ""} aria-pressed={b.id === sel?.id} onClick={() => { setPlanBlock(b.id); setPlanOpen(null); }}>
                {b.name}<span>{status(b)} · desde {shortDate(b.start_date)}</span>
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div className="blockinfo">
            <div className="meta num">{shortDate(sel.start_date)} → {shortDate(blockEnd(sel))} · {sel.weeks} semanas{sel.deload_week ? ` · descarga en semana ${sel.deload_week}` : ""}</div>
            {sel.focus && <p>{sel.focus}</p>}
          </div>
        )}
        {sel && sel.start_date <= todayKey && (weekOf(sel, todayKey) >= sel.weeks || blockEnd(sel) < todayKey || balances[sel.id]) && (
          <section className="card closecard" style={{ marginTop: 14 }}>
            <div className="eyebrow">Balance de {sel.name}</div>
            {balances[sel.id] ? <>
              <p className="meta num" style={{ margin: 0 }}>{balances[sel.id].done} de {balances[sel.id].planned} sesiones hechas · preparado el {shortDate(balances[sel.id].at.slice(0, 10))}</p>
              <div className="balance">{balances[sel.id].text}</div>
              {Object.keys(balances[sel.id].tips || {}).length > 0 && (
                <div className="tip carry">
                  <b>Notas que verás en el bloque siguiente</b>
                  <span>La primera vez que te toque cada ejercicio, su tarjeta te lo recuerda:</span>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {Object.entries(balances[sel.id].tips!).map(([m, t]) => <li key={m}><b style={{ textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>{machines[m]?.name || m}:</b> {t}</li>)}
                  </ul>
                </div>
              )}
              <button type="button" className="linkbtn" disabled={busyBalance} onClick={() => askBalance(sel.id)}>{busyBalance ? "Actualizando…" : "Actualizar balance"}</button>
            </> : <>
              <p style={{ margin: 0 }}>Revisa qué avanzó en estas {sel.weeks} semanas, qué conviene cuidar y qué proponer para el siguiente bloque.</p>
              <button type="button" className="big" disabled={busyBalance} onClick={() => askBalance(sel.id)}>{busyBalance ? "Preparando el balance…" : "Preparar balance"}</button>
            </>}
            {balanceErr && <p className="msg">{balanceErr}</p>}
          </section>
        )}
        {canDo && <h2 className="sect">Esta semana</h2>}
        <div className="list">{(canDo ? thisWeek() : [1, 2, 3, 4, 5, 6, 0].map((di) => ({ k: "", di }))).map(({ k, di }) => {
          const r = list.find((x) => x.weekdays.includes(di)) || null; const isOpen = planOpen === di;
          const isToday = canDo && k === todayKey, wasDone = canDo && !!k && sessionDone(k);
          return (
            <section className={`card ${isToday ? "today" : wasDone ? "done" : ""}`} key={di}>
              <button type="button" className="day" aria-expanded={r ? isOpen : undefined} onClick={() => setPlanOpen(isOpen ? null : di)}>
                <span className="d">{DAYS[di].slice(0, 3)}</span>
                <span><span className="name">{r ? r.name : "Descanso"}</span><div className="meta">{r ? `${r.duration_min} min` : "Recuperación"}</div></span>
                {wasDone ? <span className="badge ok">Hecho</span> : isToday ? <span className="badge today">Hoy</span> : <span className="meta" aria-hidden="true">{r ? (isOpen ? "▴" : "▾") : ""}</span>}
              </button>
              {isOpen && r && <>
                <ol className="plist">{r.items.map((x, i) => <li key={i}>{x.label || machines[x.m]?.name} <span>· {targetText(x)}</span>{x.note && <em>{x.note}</em>}</li>)}</ol>
                {canDo && <div style={{ padding: "0 12px 12px" }}><button type="button" className="big ghost" onClick={() => chooseRoutine(r.slug)}>Hacer esta rutina hoy</button></div>}
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
      <div className="wrap">{tab === "hoy" ? Hoy() : tab === "prog" ? Progreso() : tab === "plan" ? Plan() : PerfilView()}</div>
      {photoSheet && <PhotoSheet uid={uid} machines={machines} onClose={() => setPhotoSheet(false)} onSaved={(m) => putMachine(m)} />}
      {sheet !== undefined && (
        <DiscomfortSheet machines={machines} initialMachine={sheet}
          options={(curRoutine?.items || []).filter((x) => x.k !== "cardio").map((x) => x.m)}
          onClose={() => setSheet(undefined)}
          onSaved={(d) => { upsertDiscomfort(d); setSheet(undefined); setTab("perfil"); window.scrollTo(0, 0); }} />
      )}
      <div className="dock">
        {work && <WorkBar work={work} onFinish={finishWork} onCancel={() => setWork(null)} onPause={pauseWork} onPlus={plusWork} />}
        {viewer && (
          <div className="viewer" role="dialog" aria-modal="true" aria-label="Foto" onClick={() => setViewer(null)}>
            {viewer.src && <img src={viewer.src} alt={viewer.caption} />}
            <div className="vbar"><span>{viewer.caption}</span><button type="button" onClick={() => setViewer(null)}>Cerrar</button></div>
          </div>
        )}
        {!work && rest && <RestBar rest={rest} onClose={closeRest} onPlus={() => setRest({ ...rest, end: Math.max(rest.end, Date.now()) + 30000, total: rest.total + 30 })} />}
        <nav className="tabs" aria-label="Secciones">
          {([["hoy", "Hoy", <path key="a" d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />],
             ["prog", "Progreso", <path key="b" d="M3 17l6-6 4 4 8-8M15 7h6v6" />],
             ["plan", "Plan", <g key="c"><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></g>],
             ["perfil", "Perfil", <g key="d"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></g>]] as const).map(([k, l, icon]) => (
            <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); setPicking(false); window.scrollTo(0, 0); }}>
              <svg viewBox="0 0 24 24">{icon}</svg>{l}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}
