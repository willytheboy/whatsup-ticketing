import type { Metadata, Viewport } from "next";
import Shell from "@/components/Shell";
import Pwa from "@/components/Pwa";
import { ConfigProvider } from "@/components/Config";
import { getLang } from "@/lib/lang-server";
import { getTenantConfig } from "@/lib/features-server";
import { THEME_COLOR } from "@/lib/themes";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getTenantConfig();
  return {
    title: `${brand.name} ${brand.country}`,
    description: brand.tagline,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default", startupImage: ["/splash-1170x2532.png"] },
  };
}
export async function generateViewport(): Promise<Viewport> {
  const cfg = await getTenantConfig();
  // Locked to the device: no pinch/double-tap zoom and no focus zoom, so the page can never be panned sideways on a phone or PDA.
  return { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: THEME_COLOR[cfg.theme] };
}

/** System font stack only (brief §3.3): the app must render offline and from a local file on iOS Safari.
    The theme (tenants.config.theme, or a ?theme= preview) is a data attribute on <html>; globals.css maps it to tokens. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang();
  const cfg = await getTenantConfig();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-theme={cfg.theme === "cedar" ? undefined : cfg.theme}>
      <body>
        <ConfigProvider value={cfg}>
          <Shell>{children}</Shell>
          <Pwa />
        </ConfigProvider>
      </body>
    </html>
  );
}
