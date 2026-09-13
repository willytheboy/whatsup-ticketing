// Runtime configuration. Every value has a safe default so the app builds and runs
// without environment variables (the anon key is public by design; RLS protects the data).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://xhwmgnhspyaqsgggvujo.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhod21nbmhzcHlhcXNnZ2d2dWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTM0OTgsImV4cCI6MjEwNDg4OTQ5OH0.x54qWu8zFvpcMTaTH-6ai8lN--1RVKhsFGbmErOI-bY";
export const TENANT = process.env.NEXT_PUBLIC_TENANT ?? "lb";
export const APP_ROLE = process.env.NEXT_PUBLIC_APP_ROLE ?? "ticketing";
export const BACKOFFICE_URL = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "https://whatsup-backoffice.vercel.app";

/** Tenant time zone used for every date/time shown to buyers and staff. */
export const TZ = "Asia/Beirut";

// Fee model (mirrors tenants.* defaults; the edge function is the source of truth at checkout)
export const FEE_PCT = 0.05;
export const FEE_FIXED = 0.5;
export const ORGANISER_FEE_PCT = 0.03;
export const PROCESSING_PCT = 0.025;
export const FX_RATE = 89500; // LBP per USD (display only)

/** Buyer price for one ticket, all-in. Free tiers stay free. */
export const allIn = (face: number) => (face === 0 ? 0 : Math.round((face + face * FEE_PCT + FEE_FIXED) * 100) / 100);
/** What the organiser keeps per ticket after the organiser fee and card processing. */
export const organiserNet = (face: number) => Math.round(face * (1 - ORGANISER_FEE_PCT - PROCESSING_PCT) * 100) / 100;
export const money = (usd: number) => (usd === 0 ? "Free" : "$" + usd.toFixed(2).replace(/\.00$/, ""));
export const lbp = (usd: number) => "LBP " + (Math.round((FX_RATE * usd) / 1000) * 1000).toLocaleString("en-US");
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
/** Signed money for ledgers: −$12.50 */
export const signed = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return (v < 0 ? "−" : "") + "$" + Math.abs(v).toFixed(2);
};
