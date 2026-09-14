"use client";
import { useState } from "react";
import { useLang, useT } from "@/lib/lang";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };

/** Calendar sheet for stays (brief §5.4): tap check-in, tap check-out; nights are the difference. Arabic month names follow the app language. */
export default function CalendarSheet({ checkin, nights, onChange, onClose }: { checkin: string; nights: number; onChange: (checkin: string, nights: number) => void; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [month, setMonth] = useState(() => { const d = new Date(checkin + "T12:00:00"); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [start, setStart] = useState<string | null>(checkin);
  const [end, setEnd] = useState<string | null>(nights ? addDays(checkin, nights) : null);
  const today = iso(new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const title = month.toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB", { month: "long", year: "numeric" });
  const dows = lang === "ar" ? ["ن", "ث", "ر", "خ", "ج", "س", "ح"] : ["M", "T", "W", "T", "F", "S", "S"];
  const tap = (d: string) => {
    if (d < today) return;
    if (!start || (start && end) || d <= start) { setStart(d); setEnd(null); return; }
    setEnd(d);
  };
  const n = start && end ? Math.round((new Date(end + "T12:00:00").getTime() - new Date(start + "T12:00:00").getTime()) / 864e5) : 0;
  return (
    <div className="sheet" onClick={onClose}>
      <div role="dialog" aria-label={t("pickDates")} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <button className="btn xs line" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
          <b style={{ fontSize: 15 }}>{title}</b>
          <button className="btn xs line" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginTop: 10, textAlign: "center", fontSize: 13 }}>
          {dows.map((d, i) => <div key={i} className="small" style={{ padding: 4 }}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const inRange = start && end && d > start && d < end;
            const on = d === start || d === end;
            const off = d < today;
            return <button key={d} onClick={() => tap(d)} disabled={off} style={{ minHeight: 40, borderRadius: 10, border: "1px solid " + (on ? "var(--g1)" : "transparent"), background: on ? "var(--g1)" : inRange ? "var(--g4)" : "transparent", color: on ? "#fff" : off ? "var(--line)" : "var(--ink)", fontWeight: on ? 700 : 400 }}>{Number(d.slice(-2))}</button>;
          })}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="small">{start ? `${t("checkIn")} ${start}` : t("pickCheckin")}{end ? ` → ${end} · ${n} ${t("nights")}` : start ? ` · ${t("pickCheckout")}` : ""}</span>
          <button className="btn red sm" disabled={!start || !end} onClick={() => { if (start && end) { onChange(start, n); onClose(); } }}>{t("done2")}</button>
        </div>
      </div>
    </div>
  );
}
