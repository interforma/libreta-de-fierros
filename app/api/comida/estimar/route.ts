import { NextResponse } from "next/server";
import { askClaude, CoachError, MODEL_DEEP, userDb } from "@/lib/coach";

// Estima kcal y proteína de una comida desde una foto (etiqueta o plato) o un texto (escrito o dictado).
// No guarda nada: el cliente muestra la cifra, la persona la confirma o corrige y recién ahí se anota.
// Lo aprendido con Sergio (claude/aprendizajes-alimentacion.md) está en las reglas del prompt.

const SYSTEM = `Eres el asistente de alimentación de "Libreta de Fierros", una app de gimnasio. Estimas calorías y proteína de lo que la persona comió. No eres nutricionista y no das consejos aquí: solo cifras.
Responde SOLO con un objeto JSON válido, sin texto antes ni después, con estas claves:
"tipo": "etiqueta" si la foto muestra la tabla nutricional de un envase; "plato" si muestra comida servida; "texto" si te la describieron con palabras; "no_es_comida" si no se puede identificar comida.
"nombre": nombre corto en español de Chile (ej.: "Yogur Soprole Protein vainilla", "Porotos con riendas").
"porcion": la porción a la que corresponden las cifras (ej.: "1 unidad (155 g)", "1 plato", "2 huevos").
"kcal": número entero.
"proteina_g": número con un decimal.
"colageno_g": gramos de la proteína que vienen de colágeno (gelatina, péptidos de colágeno) según la etiqueta o los ingredientes; 0 si no hay.
"frutas_verduras": porciones de fruta o verdura que aporta (1 porción ≈ 1 fruta mediana, 1 taza de verdura cruda o ½ taza cocida); 0 si no hay. Puede ser 0,5.
"igual_a": el id de un alimento habitual de la lista si es claramente el mismo producto o receta; si no, null.
"rango": si es estimado y la incertidumbre es grande, [kcal_min, kcal_max]; si no, null.
"preguntas": lista de 0 a 2 preguntas que cambiarían mucho la cifra, cada una {"id": "...", "texto": "...", "opciones": ["...", "..."]} con 2 a 4 opciones cortas. Úsalas SOLO en platos caseros y solo si aún no fueron respondidas.
"ingredientes": lista de 1 a 12 cosas que identificaste, cada una corta y con cantidad aproximada si se puede (ej.: ["Bistec ~200 g", "Betarraga cocida", "Palta ¼", "Huevo duro"]). En una etiqueta, solo el producto.
"nota": una frase corta si hay algo importante (ej.: "Usé la porción de la etiqueta, no los 100 g"); si no, "".
Reglas:
- Etiqueta: copia las cifras POR PORCIÓN del envase, no por 100 g. Si la porción no aparece, usa el envase completo y dilo en la nota. Si un ingrediente declara colágeno, estima cuánto de la proteína es colágeno.
- Plato o texto: estima con porciones caseras chilenas. Crudo o cocido cambia mucho la cifra de carnes, arroz y fideos: si no se sabe, pregunta "¿Los gramos son crudos o cocidos?". El aceite no se ve en la foto: si es salteado, frito o con aliño, pregunta "¿Cuánto aceite?" con opciones como "Nada", "Un chorrito (1 cdta)", "1 cucharada", "Frito".
- Si ya hay respuestas a preguntas, úsalas y no vuelvas a preguntar lo mismo.
- Si la persona dice una cantidad ("2 huevos", "media taza"), las cifras son para esa cantidad.
- Prefiere un alimento habitual de la lista si calza: sus cifras son reales.
- No inventes marcas.
- En fotos de plato, el color engaña: la betarraga, las salsas o el ketchup tiñen otros alimentos (papas, arroz, fideos). Si algo teñido podría ser otro alimento o puede haber comida tapada, dilo en la nota (ej.: "Lo rojo podría ser papa teñida por la betarraga").
- Si llega una CORRECCIÓN de la persona, manda sobre lo que viste o estimaste antes: agrega lo que faltó, quita lo que sobró, corrige lo que confundiste y recalcula todo (cifras, ingredientes, nombre si corresponde). No preguntes de nuevo lo que la corrección ya aclara.`;

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const num = (v: unknown, max: number) => { const n = Number(v); return isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };

export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return NextResponse.json({ error: "Inicia sesión de nuevo." }, { status: 401 });
  const { image, media_type, text, answers, previous, correccion } = await req.json().catch(() => ({}));
  const hasImg = typeof image === "string" && image.length > 0;
  if (hasImg && !TYPES.includes(media_type)) return NextResponse.json({ error: "Formato de foto no válido." }, { status: 400 });
  if (hasImg && image.length > 3_500_000) return NextResponse.json({ error: "La foto es muy pesada. Prueba con otra." }, { status: 413 });
  const said = typeof text === "string" ? text.trim().slice(0, 600) : "";
  const fix = typeof correccion === "string" ? correccion.trim().slice(0, 400) : "";
  if (!hasImg && said.length < 2 && !(fix.length >= 2 && previous?.nombre)) return NextResponse.json({ error: "Saca una foto o escribe qué comiste." }, { status: 400 });

  const { data: foods } = await db.from("foods").select("id,name,portion,kcal,protein_g").order("uses", { ascending: false }).limit(60);
  const list = (foods || []).map((f: any) => `${f.id}: ${f.name} — ${f.portion}: ${Number(f.kcal)} kcal, ${Number(f.protein_g)} g proteína`).join("\n");
  const ans = Array.isArray(answers) ? answers.slice(0, 4).map((a: any) => `${String(a?.texto || "").slice(0, 120)} → ${String(a?.respuesta || "").slice(0, 80)}`).join("\n") : "";

  const ask = [
    `ALIMENTOS HABITUALES DE LA PERSONA (id: nombre — porción: cifras):\n${list || "(ninguno aún)"}`,
    said ? `LO QUE DIJO LA PERSONA: ${said}` : "",
    previous?.nombre ? `TU ESTIMACIÓN ANTERIOR: ${String(previous.nombre).slice(0, 80)}, ${String(previous.porcion || "").slice(0, 60)}, ${num(previous.kcal, 5000)} kcal, ${num(previous.proteina_g, 400)} g proteína.${Array.isArray(previous.ingredientes) && previous.ingredientes.length ? ` Ingredientes: ${previous.ingredientes.slice(0, 12).map((x: unknown) => String(x).slice(0, 50)).join("; ")}.` : ""}` : "",
    fix ? `CORRECCIÓN DE LA PERSONA (manda sobre lo anterior): ${fix}` : "",
    ans ? `RESPUESTAS A TUS PREGUNTAS:\n${ans}` : "",
    "Estima la comida.",
  ].filter(Boolean).join("\n\n");

  try {
    const raw = await askClaude({
      model: MODEL_DEEP, system: SYSTEM, maxTokens: 900,
      content: hasImg ? [{ type: "image", source: { type: "base64", media_type, data: image } }, { type: "text", text: ask }] : ask,
    });
    const m = raw.match(/\{[\s\S]*\}/);
    let out: any = null;
    try { out = m ? JSON.parse(m[0]) : null; } catch { out = null; }
    if (!out) return NextResponse.json({ error: "No pude leer la comida. Prueba con otra foto o escríbela." }, { status: 422 });
    if (out.tipo === "no_es_comida") return NextResponse.json({ error: out.nota || "No reconocí comida en la foto. Prueba con la etiqueta o con el plato completo." }, { status: 422 });
    const known = new Set((foods || []).map((f: any) => f.id));
    const kcal = Math.round(num(out.kcal, 5000));
    const protein = Math.round(num(out.proteina_g, 400) * 10) / 10;
    const rango = Array.isArray(out.rango) && out.rango.length === 2 ? [Math.round(num(out.rango[0], 5000)), Math.round(num(out.rango[1], 5000))] : null;
    const preguntas = (Array.isArray(out.preguntas) ? out.preguntas : []).slice(0, 2)
      .map((q: any) => ({ id: String(q?.id || "").slice(0, 30), texto: String(q?.texto || "").slice(0, 120), opciones: (Array.isArray(q?.opciones) ? q.opciones : []).slice(0, 4).map((o: any) => String(o).slice(0, 40)) }))
      .filter((q: any) => q.texto && q.opciones.length >= 2);
    return NextResponse.json({
      tipo: ["etiqueta", "plato", "texto"].includes(out.tipo) ? out.tipo : hasImg ? "plato" : "texto",
      nombre: String(out.nombre || "Comida").slice(0, 80),
      porcion: String(out.porcion || "1 porción").slice(0, 60),
      kcal, proteina_g: protein,
      colageno_g: Math.min(protein, Math.round(num(out.colageno_g, 400) * 10) / 10),
      frutas_verduras: Math.round(num(out.frutas_verduras, 10) * 2) / 2,
      igual_a: out.igual_a && known.has(out.igual_a) ? out.igual_a : null,
      rango: rango && rango[0] < rango[1] ? rango : null,
      preguntas,
      ingredientes: (Array.isArray(out.ingredientes) ? out.ingredientes : []).slice(0, 12).map((x: unknown) => String(x).slice(0, 50)).filter(Boolean),
      nota: String(out.nota || "").slice(0, 200),
    });
  } catch (e) {
    const err = e instanceof CoachError ? e : new CoachError("No se pudo estimar la comida.", 500);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
