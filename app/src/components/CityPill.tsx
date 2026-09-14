"use client";
import { useState } from "react";
import { setCity, useT } from "@/lib/lang";

/** City scope pill in the band; opens the bottom sheet. Coming-soon countries show a placeholder, not an empty feed. */
export default function CityPill({ city, cities, label, soon = [] }: { city: string; cities: { name: string; name_ar: string | null }[]; label: string; soon?: { name: string; name_ar: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <button className="cpill" onClick={() => setOpen(true)} aria-haspopup="dialog">{label} ▾</button>
      {open && (
        <div className="sheet" onClick={(e) => e.target === e.currentTarget && setOpen(false)} role="dialog">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{t("chooseCity")}</div>
            <div className="small" style={{ margin: "10px 0 2px", fontWeight: 600, color: "var(--ink2)" }}>{t("country")}</div>
            <button className="cbtn" onClick={() => setCity("")}><span>{t("allCities")}</span><span style={{ color: "var(--ink3)" }}>{city === "" ? "✓" : ""}</span></button>
            {cities.map((c) => (
              <button key={c.name} className="cbtn" onClick={() => setCity(c.name)}>
                <span>{c.name_ar && document.documentElement.lang === "ar" ? c.name_ar : c.name}</span>
                <span style={{ color: "var(--ink3)" }}>{city === c.name ? "✓" : ""}</span>
              </button>
            ))}
            {soon.map((c) => (
              <div key={c.name}>
                <div className="small" style={{ margin: "14px 0 2px", fontWeight: 600, color: "var(--ink2)" }}>{c.name_ar && document.documentElement.lang === "ar" ? c.name_ar : c.name} · {t("comingSoon")}</div>
                <div className="cbtn" style={{ color: "var(--ink3)" }}><span>{t("soonNote")}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
