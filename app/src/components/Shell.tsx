"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/lang";
import { I } from "./Icons";
import { ToastProvider } from "./Toast";
import { useConfig } from "./Config";
import { tabVisible, type TabId } from "@/lib/features";

const TABS: [TabId, string, string, keyof typeof I][] = [
  ["home", "/", "nHome", "home"],
  ["search", "/search", "nSearch", "search"],
  ["ask", "/ask", "nAsk", "ask"],
  ["radio", "/radio", "nRadio", "radio"],
  ["vibe", "/vibe", "nVibe", "vibe"],
  ["wallet", "/wallet", "nWallet", "wallet"],
];
const HIDE = ["/checkout", "/t/", "/login", "/story/", "/org/new", "/org/promote", "/room/", "/admin", "/claim/", "/squad/"];

/** Up to six tabs for everyone (brief §4.4); the back office decides which ones a tenant shows (tenants.config.tabs).
    Venue tools live behind Profile → Venue, so buyers never see them. */
function Tabs() {
  const path = usePathname();
  const t = useT();
  const cfg = useConfig();
  if (HIDE.some((p) => path.startsWith(p))) return null;
  const on = (href: string) => (href === "/" ? path === "/" || path.startsWith("/e/") : path.startsWith(href));
  const tabs = TABS.filter(([id]) => tabVisible(cfg, id));
  return (
    <nav className="tabs" aria-label="Main">
      {tabs.map(([, href, key, icon]) => {
        const Icon = I[icon];
        return (
          <Link key={href} href={href} className={`tab ${on(href) ? "on" : ""}`}>
            <Icon />
            <span>{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone-shaped stage with the bottom tab bar. The back office (/admin) renders full-width without it. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/admin")) return <ToastProvider>{children}</ToastProvider>;
  return (
    <ToastProvider>
      <div className="stage">
        {children}
        <Tabs />
      </div>
    </ToastProvider>
  );
}
