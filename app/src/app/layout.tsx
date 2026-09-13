import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Tajawal } from "next/font/google";
import Shell from "@/components/Shell";
import { getLang } from "@/lib/lang-server";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], weight: ["500", "700", "800"], variable: "--font-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });
const arabic = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700", "800"], variable: "--font-ar", display: "swap" });

export const metadata: Metadata = {
  title: "WhatsUp Tickets",
  description: "Events in Lebanon, tickets on WhatsApp.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#F4F7F1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className={`${display.variable} ${body.variable} ${arabic.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
