"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/lang";
import { I } from "./Icons";
import { ToastProvider } from "./Toast";

const TABS: [string, string, keyof typeof I][] = [
  ["/", "nHome", "home"],
  ["/search", "nSearch", "search"],
  ["/ask", "nAsk", "ask"],
  ["/radio", "nRadio", "radio"],
  ["/vibe", "nVibe", "vibe"],
  ["/wallet", "nWallet", "wallet"],
];
const HIDE = ["/checkout", "/t/", "/login", "/story/", "/org/new", "/org/promote", "/room/", "/admin", "/claim/", "/squad/"];

/** Six tabs for everyone (brief §4.4). Venue tools live behind Profile → Venue, so buyers never see them. */
function Tabs() {
  const path = usePathname();
  const t = useT();
  if (HIDE.some((p) => path.startsWith(p))) return null;
  const on = (href: string) => (href === "/" ? path === "/" || path.startsWith("/e/") : path.startsWith(href));
  return (
    <nav className="tabs" aria-label="Main">
      {TABS.map(([href, key, icon]) => {
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
