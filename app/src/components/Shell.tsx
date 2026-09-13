"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/lang";
import { useRoles } from "@/lib/roles";
import { BACKOFFICE_URL } from "@/lib/config";

function Tabs() {
  const path = usePathname();
  const t = useT();
  const roles = useRoles();
  if (path.startsWith("/checkout") || path.startsWith("/t/") || path.startsWith("/login") || path.startsWith("/org/new") || path.startsWith("/admin")) return null;
  const tabs: [string, string, string][] = [
    ["/", "discover", "◎"],
    ["/live", "liveTab", "♫"],
    ["/tickets", "tickets", "▣"],
  ];
  if (roles.isOrganiser) tabs.push(["/org", "organiser", "▤"]);
  if (roles.isDoor) tabs.push(["/org/door", "door", "▦"]);
  if (roles.isAdmin) tabs.push([BACKOFFICE_URL, "backOffice", "▥"]);
  const on = (href: string) =>
    href === "/" ? path === "/" : href === "/org" ? path.startsWith("/org") && !path.startsWith("/org/door") : !href.startsWith("http") && path.startsWith(href);
  return (
    <nav className="tabs" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
      {tabs.map(([href, key, icon]) => (
        <Link key={href} href={href} className={`tab ${on(href) ? "on" : ""}`}>
          <span className="ico">{icon}</span>
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}

/** Phone-shaped stage with the bottom tab bar. The back office (/admin) renders full-width without it. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/admin")) return <>{children}</>;
  return (
    <div className="stage">
      {children}
      <Tabs />
    </div>
  );
}
