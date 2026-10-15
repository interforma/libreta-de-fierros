import { NextResponse } from "next/server";
import { askClaude, CoachError, MODEL_DEEP, userDb } from "@/lib/coach";

// Reconoce una máquina desde una foto del gimnasio y explica cómo se usa.
// No guarda nada: el cliente decide si la agrega al catálogo o guarda la foto en una que ya existe.

const SYSTEM = `Eres el entrenador de "Libreta de Fierros", una app personal de gimnasio. El usuario te manda una foto de una máquina o implemento de su gimnasio que no sabe usar.
Responde SOLO con un objeto JSON válido, sin texto antes ni después, con estas claves:
"es_maquina": true si la foto muestra una máquina o implemento de gimnasio, si no false.
"nombre": nombre común en español de Chile, corto (ej.: "Prensa de piernas 45°", "Remo en máquina con apoyo").
"grupo": grupos musculares principales separados por " · " (ej.: "Espalda · Bíceps").
"igual_a": el slug de su catálogo si es claramente la misma máquina o ejercicio, si no null.
"como_se_usa": 1 o 2 frases simples sobre qué se hace en ella.
"guia": guía en texto plano (sin markdown) de máximo 120 palabras con estas partes, cada una con su título y dos puntos en su propia línea: "Ajusta:", "Movimiento:", "Respira:", "Evita:".
"confianza": "alta", "media" o "baja".
Si la foto no se ve bien o no es una máquina, usa es_maquina false, deja nombre vacío y explica en como_se_usa qué foto necesitas. No inventes marcas ni modelos.`;

const TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { image, media_type } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || !image || !TYPES.includes(media_type)) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  if (image.length > 3_500_000) return NextResponse.json({ error: "La foto es muy pesada. Prueba con otra." }, { status: 413 });

  const { data: machines } = await db.from("machines").select("slug,name,muscle_group");
  const catalog = (machines || []).map((m: any) => `${m.slug}: ${m.name} (${m.muscle_group})`).join("\n");

  try {
    const raw = await askClaude({
      model: MODEL_DEEP, system: SYSTEM, maxTokens: 900,
      content: [
        { type: "image", source: { type: "base64", media_type, data: image } },
        { type: "text", text: `CATÁLOGO DEL USUARIO (slug: nombre):\n${catalog}\n\n¿Qué máquina es y cómo se usa?` },
      ],
    });
    const m = raw.match(/\{[\s\S]*\}/);
    let out: any = null;
    try { out = m ? JSON.parse(m[0]) : null; } catch { out = null; }
    if (!out) return NextResponse.json({ error: "No pude reconocer la máquina. Intenta con otra foto, que se vea completa." }, { status: 422 });
    const known = new Set((machines || []).map((x: any) => x.slug));
    return NextResponse.json({
      es_maquina: !!out.es_maquina,
      nombre: String(out.nombre || "").slice(0, 80),
      grupo: String(out.grupo || "").slice(0, 80),
      igual_a: out.igual_a && known.has(out.igual_a) ? out.igual_a : null,
      como_se_usa: String(out.como_se_usa || "").slice(0, 400),
      guia: String(out.guia || "").slice(0, 1500),
      confianza: ["alta", "media", "baja"].includes(out.confianza) ? out.confianza : "media",
    });
  } catch (e) {
    const err = e as CoachError;
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
