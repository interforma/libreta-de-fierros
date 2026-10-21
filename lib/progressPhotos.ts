"use client";

// Fotos de progreso por máquina. Se guardan en el bucket privado `machine-photos`,
// carpeta `<uid>/progreso/<fecha>/`, y la ruta queda en sessions.items[<máquina>].photos.
// Sin señal, la foto espera en el teléfono (IndexedDB) y se sube cuando vuelve la conexión.

import { supabase } from "@/lib/supabase";

const DB = "lf-fotos", STORE = "cola";

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((ok, fail) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

export const progressPath = (uid: string, date: string, m: string) => `${uid}/progreso/${date}/${m}-${Date.now()}.jpg`;

export const queuePut = (path: string, blob: Blob) => tx("readwrite", (s) => s.put(blob, path)).catch(() => undefined);
export const queueDel = (path: string) => tx("readwrite", (s) => s.delete(path)).catch(() => undefined);

/** Fotos que aún no se suben: ruta → blob. */
export async function queueAll(): Promise<Record<string, Blob>> {
  try {
    const keys = (await tx("readonly", (s) => s.getAllKeys())) as string[];
    const out: Record<string, Blob> = {};
    for (const k of keys) { const b = await tx<Blob>("readonly", (s) => s.get(k)); if (b) out[k] = b; }
    return out;
  } catch { return {}; }
}

export async function uploadOne(path: string, blob: Blob) {
  const { error } = await supabase.storage.from("machine-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  await queueDel(path);
}

/** Sube lo que quedó pendiente. Devuelve cuántas fotos se subieron. */
export async function flushPhotos(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const all = await queueAll();
  let n = 0;
  for (const [path, blob] of Object.entries(all)) { try { await uploadOne(path, blob); n++; } catch { break; } }
  return n;
}
