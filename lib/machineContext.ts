// Contexto de una máquina para el entrenador: qué es, cómo la tiene ajustada el usuario,
// su perfil y molestias activas. Solo en el servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { profileLines } from "@/lib/coach";

export async function machineContext(db: SupabaseClient, slug: string) {
  const [{ data: m }, { data: p }, { data: dis }, { data: all }] = await Promise.all([
    db.from("machines").select("slug,name,muscle_group,how_to,alternative,settings,unit,guide").eq("slug", slug).maybeSingle(),
    db.from("profiles").select("*").maybeSingle(),
    db.from("discomforts").select("area,side,intensity,machine_slug,note").eq("resolved", false).limit(5),
    db.from("machines").select("slug,name,muscle_group"),
  ]);
  if (!m) return null;
  const same = (all || []).filter((x: any) => x.slug !== slug && x.muscle_group.split(" · ")[0] === m.muscle_group.split(" · ")[0]);
  const text = [
    profileLines((p || {}) as any),
    `EJERCICIO: ${m.name} (${m.muscle_group}). Descripción del catálogo: ${m.how_to || "sin descripción"}.`,
    m.alternative ? `ALTERNATIVA DEL CATÁLOGO (si está ocupada o no la entiende): ${m.alternative}` : "",
    m.settings ? `AJUSTES QUE ANOTÓ EL USUARIO: ${m.settings}.` : "",
    (dis || []).length ? `MOLESTIAS ACTIVAS: ${(dis || []).map((d: any) => `${d.area}${d.side ? " " + d.side : ""} ${d.intensity}/10${d.machine_slug === slug ? " (en este ejercicio)" : ""}`).join("; ")}.` : "MOLESTIAS ACTIVAS: ninguna.",
    same.length ? `OTROS EJERCICIOS DEL MISMO GRUPO EN SU CATÁLOGO: ${same.map((x: any) => x.name).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
  return { machine: m as { slug: string; name: string; muscle_group: string; how_to: string; settings: string; unit: string; guide: string | null }, text };
}
