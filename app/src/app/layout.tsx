import type { Metadata, Viewport } from "next";
import Shell from "@/components/Shell";
import { getLang } from "@/lib/lang-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "What's Up Lebanon",
  description: "Everything to do in Lebanon — events, dining, beach, stays, passes. Tickets on WhatsApp.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#639922",
};

/** System font stack only (brief §3.3): the app must render offline and from a local file on iOS Safari. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
