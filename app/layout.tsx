import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({ src: "../public/fonts/geist-latin.woff2", display: "swap", variable: "--font-sans" });
export const metadata: Metadata = {
  title: "ShuttleSense | Understand Your Game",
  icons: { icon: "/favicon.svg" },
  description: "A focused badminton match review. Explore rally evidence, court movement, and your next practice plan.",
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f6f4" }, { media: "(prefers-color-scheme: dark)", color: "#141917" }] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={sans.variable}><body>{children}</body></html>;
}
