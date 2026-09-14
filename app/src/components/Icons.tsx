/** Line icons, 1.7 px stroke (brief §3.6). */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const I = {
  home: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>,
  search: () => <svg viewBox="0 0 24 24" {...P}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>,
  ask: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 5h16v11H8l-4 4z" /></svg>,
  radio: () => <svg viewBox="0 0 24 24" {...P}><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M6 8l10-5" /><circle cx="15" cy="14" r="2.5" /></svg>,
  vibe: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg>,
  wallet: () => <svg viewBox="0 0 24 24" {...P}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12h5" /><circle cx="16" cy="12.5" r="1" /></svg>,
  user: () => <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>,
  share: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 3v12M7 8l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" /></svg>,
  send: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 12l16-8-6 16-2-7z" /></svg>,
  mic: () => <svg viewBox="0 0 24 24" {...P}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
};
