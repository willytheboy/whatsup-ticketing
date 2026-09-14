/* Tenant configuration (v0.7): what the client app shows, which theme it wears and whose brand it carries.
   The back office edits it at /admin/settings; it is stored in tenants.config + tenants.brand and read once per
   request (server) or once per page (client). Every key has a default so an empty config equals v0.6 exactly.
   Isomorphic: no imports from next/headers here — see features-server.ts for the server loader. */

export type ThemeId = "cedar" | "volt" | "sunset" | "ultraviolet";
export const THEMES: { id: ThemeId; name: string; line: string; swatch: [string, string, string, string] }[] = [
  { id: "cedar", name: "Cedar", line: "The brand default: white canvas, cedar greens, one red.", swatch: ["#3B6D11", "#639922", "#E24B4A", "#F4F3EE"] },
  { id: "volt", name: "Volt", line: "Acid lime on black with hot magenta calls to action. Loud, nightlife-first.", swatch: ["#1A2E05", "#84CC16", "#E6007E", "#F3F7EA"] },
  { id: "sunset", name: "Sunset Beirut", line: "Teal sea, coral sun, peach sand. Warm, beachy, works in daylight.", swatch: ["#0F766E", "#14B8A6", "#E0472A", "#FBEFE4"] },
  { id: "ultraviolet", name: "Ultraviolet", line: "Violet family with a lime primary button. Dark-mode energy on a light canvas.", swatch: ["#4C1D95", "#8B5CF6", "#C8F53A", "#F1EDFE"] },
];
export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export type TabId = "home" | "search" | "ask" | "radio" | "vibe" | "wallet";
export const TAB_IDS: TabId[] = ["home", "search", "ask", "radio", "vibe", "wallet"];

/** Every switchable surface. `group` is only for the settings page; `sheet` marks a modal / bottom sheet. */
export const FEATURES = {
  // discover
  for_you: { group: "Discover", label: "For you rail", desc: "Personalised rail on Home from what the person bought or saved." },
  saved: { group: "Discover", label: "Saved listings", desc: "Heart on listings; Saved page under Profile." },
  deals: { group: "Discover", label: "Deals on listings", desc: "Venue deals shown on the listing and in search." },
  passes: { group: "Discover", label: "Passes", desc: "Season and member passes as listings, plus the pass promo on Home." },
  stays: { group: "Discover", label: "Stays", desc: "Rooms and guesthouses as listings." },
  moments: { group: "Discover", label: "Moments", desc: "The photo-submission card on Home and the /moment page." },
  story: { group: "Discover", label: "Story card", desc: "Share-to-Story button on listings and the 9:16 card generator." },
  // ask / ai
  concierge: { group: "Ask", label: "Concierge (Ask tab)", desc: "AI concierge with voice; hands off to WhatsApp." },
  vibe: { group: "Ask", label: "Vibe", desc: "Mood → track → day plan generator." },
  // booking
  tables: { group: "Booking", label: "Tables & packages", desc: "Table picker with packages on the listing (sheet)." },
  gifts: { group: "Booking", label: "Gift a ticket", desc: "Buy for someone else by WhatsApp number (sheet)." },
  refund_protection: { group: "Booking", label: "Refund protection", desc: "Optional paid protection at checkout." },
  credit: { group: "Booking", label: "Account credit", desc: "Credit from sold-back tickets and referrals, spent at checkout." },
  currency_lbp: { group: "Booking", label: "LBP display", desc: "Show prices in LBP next to USD; currency toggle in Profile." },
  addons: { group: "Booking", label: "Add-ons", desc: "Fast lane, parking and other extras at checkout." },
  squads: { group: "Booking", label: "Squads", desc: "Group booking: one link, everyone pays their own." },
  // wallet
  transfer: { group: "Wallet", label: "Transfer a ticket", desc: "Send a ticket to a friend (sheet)." },
  resale: { group: "Wallet", label: "Resale pool", desc: "Sell a ticket back at face when the listing is sold out." },
  calendar: { group: "Wallet", label: "Add to calendar", desc: "Calendar sheet on tickets and listings." },
  // live
  radio: { group: "Live", label: "Radio", desc: "Stations and live streams (Radio tab)." },
  rooms: { group: "Live", label: "Event rooms", desc: "Chat room for each listing." },
  live_tips: { group: "Live", label: "Live tips", desc: "Tip the DJ during a live stream." },
  live_subscriptions: { group: "Live", label: "Stream passes", desc: "Paid access to streams." },
  // venue tools (organiser dashboard)
  promoters: { group: "Venue tools", label: "Promoters", desc: "Promoter links and commissions." },
  promote: { group: "Venue tools", label: "Promote", desc: "Boost, Story bundle and Takeover packages." },
  codes: { group: "Venue tools", label: "Promo codes", desc: "Discount codes incl. one-tap flash codes." },
  insights: { group: "Venue tools", label: "Insights", desc: "Sales pace, pricing suggestions, revenue forecast." },
  developers: { group: "Venue tools", label: "Developers", desc: "API keys and webhooks." },
  station: { group: "Venue tools", label: "Venue station", desc: "Venue-run radio station." },
  fraud_lockout: { group: "Venue tools", label: "Door lockout", desc: "Freeze a ticket after three duplicate scans in ten minutes." },
} as const;
export type FeatureId = keyof typeof FEATURES;
export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];

export type Brand = {
  name: string; name_ar: string;           // "What's Up" / "شو في" — the wordmark's heavy word is the country
  country: string; country_ar: string;     // "Lebanon" / "لبنان"
  ig: string;                              // Instagram handle without @
  support_wa: string;                      // digits, international
  short_host: string;                      // "wul.app" — printed on story cards
  tagline: string; tagline_ar: string;     // Home / share copy
};
export type TenantConfig = {
  slug: string;                                  // tenant slug this request is served for (hostname → tenant, else NEXT_PUBLIC_TENANT)
  theme: ThemeId;
  tabs: Record<TabId, boolean>;
  features: Record<FeatureId, boolean>;
  brand: Brand;
};

export const DEFAULT_BRAND: Brand = {
  name: "What's Up", name_ar: "شو في", country: "Lebanon", country_ar: "لبنان",
  ig: "whatsuplebanon", support_wa: "96170000000", short_host: "wul.app",
  tagline: "Everything to do in Lebanon — tickets on WhatsApp.", tagline_ar: "كل شي بيصير بلبنان — تذاكرك عالواتساب.",
};
export const DEFAULT_CONFIG: TenantConfig = {
  slug: "lb",
  theme: "cedar",
  tabs: { home: true, search: true, ask: true, radio: true, vibe: true, wallet: true },
  features: Object.fromEntries(FEATURE_IDS.map((k) => [k, true])) as Record<FeatureId, boolean>,
  brand: DEFAULT_BRAND,
};

/** Merge a raw tenants.config / tenants.brand pair with the defaults. Unknown keys are dropped; Home can never be hidden. */
export function mergeConfig(raw: unknown, brandRaw?: unknown, tenant?: { slug?: string | null; name?: string | null; country?: string | null; country_ar?: string | null }): TenantConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const b = (brandRaw && typeof brandRaw === "object" ? brandRaw : {}) as Record<string, any>;
  const tabs = { ...DEFAULT_CONFIG.tabs };
  for (const k of TAB_IDS) if (typeof r.tabs?.[k] === "boolean") tabs[k] = r.tabs[k];
  tabs.home = true;
  const features = { ...DEFAULT_CONFIG.features };
  for (const k of FEATURE_IDS) if (typeof r.features?.[k] === "boolean") features[k] = r.features[k];
  const brand: Brand = { ...DEFAULT_BRAND };
  if (tenant?.country) { brand.country = tenant.country; brand.country_ar = tenant.country_ar || tenant.country; }
  if (typeof b.instagram === "string" && b.instagram.trim()) brand.ig = b.instagram.trim().replace(/^@/, ""); // legacy key from v0.4 seeds
  for (const k of Object.keys(DEFAULT_BRAND) as (keyof Brand)[]) if (typeof b[k] === "string" && b[k].trim()) brand[k] = b[k].trim();
  return { slug: tenant?.slug || DEFAULT_CONFIG.slug, theme: isTheme(r.theme) ? r.theme : "cedar", tabs, features, brand };
}

/** Tab → the feature that must be on for the tab to make sense. */
export const TAB_FEATURE: Partial<Record<TabId, FeatureId>> = { ask: "concierge", radio: "radio", vibe: "vibe" };
export const tabVisible = (cfg: TenantConfig, tab: TabId) => cfg.tabs[tab] && (TAB_FEATURE[tab] ? cfg.features[TAB_FEATURE[tab]!] : true);

/** Swap the built-in brand words in UI copy for the tenant's (white label). Applied by t() on both server and client;
    it is a no-op for the default brand. Order matters: the longer strings first. */
export function brandify(text: string, b: Brand): string {
  if (b === DEFAULT_BRAND) return text;
  return text
    .replace(/@whatsuplebanon/g, `@${b.ig}`)
    .replace(/WhatsUp Lebanon|What's Up Lebanon/g, `${b.name} ${b.country}`)
    .replace(/#WeAreLebanon/g, `#WeAre${b.country.replace(/\s+/g, "")}`)
    .replace(/WHAT'S UP/g, b.name.toUpperCase())
    .replace(/What's Up|WhatsUp/g, b.name)
    .replace(/Lebanon/g, b.country)
    .replace(/شو في/g, b.name_ar)
    .replace(/لبنان/g, b.country_ar)
    .replace(/wul\.app/g, b.short_host);
}
