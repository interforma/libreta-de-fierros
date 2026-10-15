"use client";

import { supabase } from "@/lib/supabase";

/** Llama a una ruta del entrenador con el token de la sesión (el servidor aplica RLS con él). */
export async function callCoach<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "No se pudo conectar con el entrenador.");
  return j as T;
}

/** Achica una foto del teléfono a un JPEG liviano (lado mayor 1280 px) para subirla o enviarla a Claude. */
export async function shrinkPhoto(file: File, max = 1280): Promise<{ blob: Blob; base64: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.82));
    const base64 = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
    return { blob, base64 };
  } finally { URL.revokeObjectURL(url); }
}

/** Sube la foto a la carpeta del usuario en Storage y devuelve su ruta. */
export async function uploadMachinePhoto(uid: string, slug: string, blob: Blob) {
  const path = `${uid}/${slug}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("machine-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error("No se pudo guardar la foto. Revisa la conexión.");
  return path;
}

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "maquina";
