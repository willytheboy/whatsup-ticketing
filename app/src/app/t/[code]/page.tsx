"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import TopBar from "@/components/TopBar";
import { sb } from "@/lib/supabase-browser";
import { fmtDate, fmtTime } from "@/lib/config";
import { artClass } from "@/lib/art";
import { useT } from "@/lib/lang";

type Ticket = {
  code: string; token: string; seat: string | null; state: string;
  events: { id: string; title: string; starts_at: string; venues: { name: string; city: string } | null };
  tiers: { name: string } | null;
};

export default function TicketPage({ params }: { params: { code: string } }) {
  const t = useT();
  const [tk, setTk] = useState<Ticket | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");

  useEffect(() => {
    sb()
      .from("tickets")
      .select("code,token,seat,state,events(id,title,starts_at,venues(name,city)),tiers(name)")
      .eq("code", params.code)
      .maybeSingle()
      .then(({ data }) => {
        setTk(data as unknown as Ticket | null);
        setState(data ? "ok" : "none");
      });
  }, [params.code]);

  if (state !== "ok" || !tk)
    return (
      <>
        <TopBar back="/tickets" title={t("yourTicket")} />
        <main><div className="empty">{state === "loading" ? t("loading") : t("notFound")}</div></main>
      </>
    );

  const e = tk.events;
  const share = encodeURIComponent(
    `🎟 ${e.title}\n📅 ${fmtDate(e.starts_at)} ${fmtTime(e.starts_at)}\n📍 ${e.venues?.name}, ${e.venues?.city}\n${tk.tiers?.name}${tk.seat ? ` · seat ${tk.seat}` : ""}\nCode ${tk.code}\n${location.origin}/t/${tk.code}`,
  );
  const [pillClass, pillText] =
    tk.state === "valid" ? ["ok", t("paid")] : tk.state === "reserved" ? ["gold", t("payAtDoor")] : tk.state === "scanned" ? ["", t("checkedIn")] : ["", tk.state];

  return (
    <>
      <TopBar back="/tickets" title={t("yourTicket")} />
      <main>
        <div className="ticket">
          <div className="head">
            <div className={`art ${artClass(e.id)}`} />
            <span className={`pill ${pillClass}`} style={{ alignSelf: "flex-start" }}>{pillText}</span>
            <h2 className="display">{e.title}</h2>
          </div>
          <div className="tgrid">
            <div>
              <div className="label">{t("when")}</div>
              <b className="num">{fmtDate(e.starts_at)}</b>
              <small className="num">{fmtTime(e.starts_at)}</small>
            </div>
            <div>
              <div className="label">{t("where")}</div>
              <b>{e.venues?.name}</b>
            </div>
            <div>
              <div className="label">{t("ticket")}</div>
              <b>{tk.tiers?.name}{tk.seat ? ` · ${tk.seat}` : ""}</b>
            </div>
          </div>
          <div className="rip" />
          <div className="qr">
            <div><QRCodeSVG value={tk.token} size={176} level="M" /></div>
          </div>
          <div className="code">{tk.code}</div>
          <p className="note" style={{ textAlign: "center", margin: "0 0 16px" }}>{t(tk.state === "reserved" ? "reservedNote" : "showQr")}</p>
        </div>
        <div className="row">
          <a className="btn wa" href={`https://wa.me/?text=${share}`} target="_blank" rel="noopener">{t("sendWa")}</a>
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(`${location.origin}/t/${tk.code}`)}>{t("copyLink")}</button>
        </div>
      </main>
    </>
  );
}
