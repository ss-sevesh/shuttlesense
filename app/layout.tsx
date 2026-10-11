import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({ src: [{ path: "../public/fonts/onest-400.ttf", weight: "400" }, { path: "../public/fonts/onest-500.ttf", weight: "500" }], display: "swap", variable: "--font-sans" });
export const metadata: Metadata = {
  title: "ShuttleSense | AI Badminton Video Analysis",
  icons: { icon: "/favicon.svg" },
  description: "Local AI badminton and shuttle video analysis: rally replay, player poses, court heatmaps and evidence-based practice reports.",
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f6f4" }, { media: "(prefers-color-scheme: dark)", color: "#000000" }] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={sans.variable}><body>{children}</body></html>;
}
