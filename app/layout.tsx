import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WiWO.ADS — Sistema operativo de paid media",
  description:
    "Cola operativa de decisiones, salud de medición, pacing y trazabilidad para el ecosistema WiWO / MGC.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
