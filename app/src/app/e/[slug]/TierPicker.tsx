"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { allIn, money } from "@/lib/config";
import { useLang, useT } from "@/lib/lang";

type Tier = { id: string; name: string; name_ar: string | null; face_price: number; capacity: number; sold: number; held: number };
type Table = { id: string; name: string; name_ar: string | null; seats: number; min_spend: number; deposit: number };
export type Cart = {
  event: { id: string; slug: string; title: string };
  lines: { tier_id: string; name: string; qty: number; face: number }[];
  table: { id: string; name: string; deposit: number } | null;
};

/** Tier quantities + optional VIP table. The cart lives in sessionStorage until checkout. */
export default function TierPicker({ event, tiers, tables }: { event: Cart["event"]; tiers: Tier[]; tables: Table[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [tableId, setTableId] = useState<string | null>(null);
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const name = (x: { name: string; name_ar: string | null }) => (lang === "ar" && x.name_ar ? x.name_ar : x.name);

  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const table = tables.find((x) => x.id === tableId);
  const total = tiers.reduce((a, x) => a + (qty[x.id] ?? 0) * allIn(Number(x.face_price)), 0) + (table ? Number(table.deposit) : 0);

  const bump = (id: string, delta: number, left: number) =>
    setQty((s) => ({ ...s, [id]: Math.max(0, Math.min(Math.min(6, left), (s[id] ?? 0) + delta)) }));

  const checkout = () => {
    const cart: Cart = {
      event,
      lines: tiers.filter((x) => qty[x.id]).map((x) => ({ tier_id: x.id, name: name(x), qty: qty[x.id], face: Number(x.face_price) })),
      table: table ? { id: table.id, name: name(table), deposit: Number(table.deposit) } : null,
    };
    sessionStorage.setItem("wu-cart", JSON.stringify(cart));
    router.push("/checkout");
  };

  return (
    <>
      <div>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18 }}>{t("choose")}</h3>
          <span className="pill ok">{t("allIn")}</span>
        </div>
        <div className="stack">
          {tiers.map((x) => {
            const left = x.capacity - x.sold - x.held;
            const pct = Math.round((left / x.capacity) * 100);
            return (
              <div key={x.id} className={`tier ${left <= 0 ? "sold" : ""}`}>
                <div>
                  <div className="n">{name(x)}</div>
                  <div className="s">{left <= 0 ? t("soldOut") : `${left} ${t("left")}`}</div>
                  {left > 0 && (
                    <div className={`avail ${pct < 15 ? "low" : ""}`}>
                      <i style={{ width: `${Math.max(pct, 4)}%` }} />
                    </div>
                  )}
                </div>
                <div className="row">
                  <div className="p num">
                    {money(allIn(Number(x.face_price)))}
                    <small>{Number(x.face_price) ? t("perTicket") : ""}</small>
                  </div>
                  {left > 0 && (
                    <div className="qty">
                      <button onClick={() => bump(x.id, -1, left)} aria-label="less">−</button>
                      <span className="num">{qty[x.id] ?? 0}</span>
                      <button onClick={() => bump(x.id, 1, left)} aria-label="more">+</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sticky-cta">
        <div className="t">
          <b className="num">{total ? money(total) : "$0"}</b>
          <small>
            {count} {count === 1 ? t("ticket") : t("ticketsW")}
            {table ? ` ${t("plusTable")}` : ""} · {t("allIn").split(" — ")[0]}
          </small>
        </div>
        <button className="btn primary" disabled={count === 0 && !table} onClick={checkout}>{t("getTickets")}</button>
      </div>
      {tables.length > 0 && (
        <div>
          <h3 className="display" style={{ margin: "0 0 4px", fontSize: 18 }}>{t("tables")}</h3>
          <p className="note" style={{ margin: "0 0 8px" }}>{t("tableSub")}</p>
          <div className="stack">
            {tables.map((x) => (
              <button
                key={x.id}
                className="tier"
                style={tableId === x.id ? { borderColor: "var(--green)", background: "var(--green-soft)" } : {}}
                onClick={() => setTableId(tableId === x.id ? null : x.id)}
              >
                <div style={{ textAlign: "start" }}>
                  <div className="n">{name(x)}</div>
                  <div className="s">{x.seats} {t("seats")} · {money(Number(x.min_spend))} {t("minSpend")}</div>
                </div>
                <div className="p num">
                  {money(Number(x.deposit))}
                  <small>{t("deposit")}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {tables.length > 0 && table && (
        <button className="btn primary" onClick={checkout}>{t("getTickets")} · {money(total)}</button>
      )}
    </>
  );
}
