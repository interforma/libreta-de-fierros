"use client";

// Desplegable para listas largas (regla de diseño en CLAUDE.md).
// Encabezado grande con la cantidad y una pista de qué hay adentro; cerrado por defecto.
// Recuerda si la persona lo dejó abierto o cerrado (por usuario y por lista).

import { useEffect, useState } from "react";

export default function Fold({ storeKey, title, count, hint, defaultOpen = false, children }: {
  storeKey: string; title: string; count?: number; hint?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try { const v = localStorage.getItem(storeKey); if (v === "1" || v === "0") setOpen(v === "1"); } catch {}
  }, [storeKey]);
  function toggle() {
    const n = !open;
    setOpen(n);
    try { localStorage.setItem(storeKey, n ? "1" : "0"); } catch {}
  }
  return (
    <section className={`fold${open ? " open" : ""}`}>
      <button type="button" className="fold-h" aria-expanded={open} onClick={toggle}>
        <span>
          <b>{title}{count != null && <em className="num"> ({count})</em>}</b>
          {hint && <small>{hint}</small>}
        </span>
        <i aria-hidden="true">{open ? "−" : "+"}</i>
      </button>
      {open && <div className="fold-b">{children}</div>}
    </section>
  );
}
