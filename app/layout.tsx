import type { Metadata, Viewport } from "next";
import { Manrope, Outfit } from "next/font/google";
import "./globals.css";

const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const display = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Libreta de Fierros",
  description: "Tu registro de gimnasio: rutina del día, peso en lb o kg, descansos y progreso.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fierros", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F1EE" },
    { media: "(prefers-color-scheme: dark)", color: "#251D17" },
  ],
};

// Lee los ajustes de lectura (tamaño de letra y colores) antes del primer pintado.
const PREFS_BOOT = `try{var p=JSON.parse(localStorage.getItem("lf.prefs")||"{}"),h=document.documentElement;if(p.size&&p.size!=="normal")h.dataset.size=p.size;var t=p.theme||"light";if(t==="auto")h.removeAttribute("data-theme");else h.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${body.variable} ${display.variable}`} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
