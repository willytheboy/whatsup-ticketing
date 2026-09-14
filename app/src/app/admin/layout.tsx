"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import LoginForm from "@/components/LoginForm";
import { sb } from "@/lib/supabase-browser";
import { useAdmin } from "./_lib";

const NAV: [string, string, string][] = [
  ["/admin", "Overview", "◎"],
  ["/admin/orders", "Orders", "▣"],
  ["/admin/ledger", "Ledger", "≡"],
  ["/admin/partners", "Partners", "▤"],
  ["/admin/settlements", "Settlements", "⇄"],
  ["/admin/invoices", "Invoices", "▦"],
  ["/admin/reconcile", "Reconcile", "✓"],
  ["/admin/rules", "Rev-share", "%"],
  ["/admin/reports", "Reports", "▥"],
  ["/admin/streams", "Streams", "♫"],
  ["/admin/promotions", "Promotions", "★"],
  ["/admin/moments", "Moments", "▧"],
  ["/admin/team", "Team", "☺"],
  ["/admin/settings", "Settings", "⚙"],
  ["/admin/tenants", "Tenants", "⊕"],
  ["/admin/fraud", "Fraud & door", "⛨"],
  ["/admin/errors", "Errors", "⚠"],
  ["/admin/audit", "Audit", "⌕"],
];

function Nav({ className }: { className: string }) {
  const path = usePathname();
  const on = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav className={className}>
      {NAV.map(([href, label, icon]) => (
        <Link key={href} href={href} className={on(href) ? "on" : ""}>
          <span className="ico">{icon}</span>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Back-office shell: sidebar on desktop, top bar + scrollable bottom nav on phones. Admin roles only. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = useAdmin();
  return (
    <div className="bo">
      <aside className="bo-side">
        <Link href="/admin" className="brand">
          <span className="mark"><Logo /></span>
          <span>
            <span className="w1">What's up</span>
            <span className="w2">Back office</span>
          </span>
        </Link>
        <Nav className="bo-nav" />
        <div className="foot">
          {admin.user ? (
            <>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{admin.user.email}</div>
              <button className="note" onClick={() => sb().auth.signOut().then(() => location.reload())}>Sign out</button>
            </>
          ) : null}
          <div style={{ marginTop: 6 }}>
            <Link href="/">← Ticketing app</Link>
          </div>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <header className="bo-top">
          <span className="mark" style={{ display: "grid", placeItems: "center" }}><Logo /></span>
          <b style={{ flex: 1 }}>Back office</b>
          <Link href="/" className="pill">App</Link>
        </header>
        <main className="bo-main">
          {!admin.loaded ? (
            <div className="empty">Loading…</div>
          ) : !admin.user ? (
            <div style={{ maxWidth: 420 }}>
              <h1>Sign in</h1>
              <p className="sub" style={{ marginBottom: 12 }}>Back office access is limited to WhatsUp admins.</p>
              <LoginForm onDone={() => location.reload()} />
            </div>
          ) : !admin.isAdmin ? (
            <div className="panel" style={{ maxWidth: 480 }}>
              <h2>Admin only</h2>
              <p className="sub">{admin.user.email} has no country_admin or super_admin role on this tenant.</p>
              <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => sb().auth.signOut().then(() => location.reload())}>Sign out</button>
            </div>
          ) : (
            children
          )}
        </main>
        <div className="bo-bottom">
          <Nav className="" />
        </div>
      </div>
    </div>
  );
}
