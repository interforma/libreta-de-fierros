"use client";

// Punto, la mascota de Interforma (design system Interforma → Punto).
// En esta app Punto es la cara del entrenador: aparece solo cuando el entrenador tiene algo que decir.
// Reglas de marca: cuerpo #EE6E43, ojos #281F18, sin boca ni brazos, nunca sobre fondo naranja.
// Movimiento: entra una vez (400 ms); `alive` agrega el reposo vivo (respira, parpadea, mira) y se apaga con reducir movimiento.

import { useEffect, useState } from "react";

export type PuntoExpr = "atento" | "piensa" | "celebra" | "uy";

const BODY = "#EE6E43", EYES = "#281F18", SKY = "#CCE2ED";

export default function Punto({ expr = "atento", size = 36, alive = false, label }: { expr?: PuntoExpr; size?: number; alive?: boolean; label?: string }) {
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg className={`punto ${alive ? "alive" : ""}`} width={size} height={size} viewBox="0 0 200 200" {...a11y}>
      <g className="p-body">
        <circle cx="100" cy="108" r="72" fill={BODY} />
        <g className="p-look"><g className="p-blink">{eyes(expr)}</g></g>
      </g>
      {decor(expr)}
    </svg>
  );
}

function eyes(expr: PuntoExpr) {
  switch (expr) {
    case "piensa":
      return <><ellipse cx="94" cy="92" rx="9" ry="16" fill={EYES} /><ellipse cx="126" cy="92" rx="9" ry="16" fill={EYES} /></>;
    case "celebra":
      return <path d="M70 102l12-14 12 14M106 102l12-14 12 14" stroke={EYES} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    case "uy":
      return <><ellipse cx="82" cy="114" rx="8" ry="12" fill={EYES} /><ellipse cx="118" cy="114" rx="8" ry="12" fill={EYES} /></>;
    default:
      return <><ellipse cx="82" cy="100" rx="9" ry="16" fill={EYES} /><ellipse cx="118" cy="100" rx="9" ry="16" fill={EYES} /></>;
  }
}

function decor(expr: PuntoExpr) {
  if (expr === "piensa") return <g className="p-dots" fill="currentColor"><circle cx="160" cy="40" r="6" /><circle cx="174" cy="24" r="7.5" /><circle cx="189" cy="9" r="9" /></g>;
  if (expr === "celebra") return <g fill="currentColor"><rect x="14" y="26" width="12" height="12" rx="2" /><circle cx="182" cy="40" r="6" /></g>;
  if (expr === "uy") return <path d="M156 56q-9 14 0 20q9-6 0-20z" fill={SKY} stroke="currentColor" strokeWidth="2.5" />;
  return null;
}

/** Punto que reacciona y después queda en reposo vivo: entra con `first` (por ejemplo, celebra)
 *  y a los `after` ms pasa a "atento", respirando, parpadeando y mirando a los lados. */
export function PuntoVivo({ first = "atento", size = 56, label, after = 2200 }: { first?: PuntoExpr; size?: number; label?: string; after?: number }) {
  const [e, setE] = useState<PuntoExpr>(first);
  useEffect(() => {
    setE(first);
    if (first === "atento") return;
    const t = setTimeout(() => setE("atento"), after);
    return () => clearTimeout(t);
  }, [first, after]);
  return <Punto key={e} expr={e} size={size} alive={e === "atento"} label={label} />;
}
