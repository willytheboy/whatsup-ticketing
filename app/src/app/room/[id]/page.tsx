"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import TopBar from "@/components/TopBar";
import Chat from "@/components/Chat";
import { sb } from "@/lib/supabase-browser";
import { useLang, useT } from "@/lib/lang";

type Ev = { id: string; slug: string; title: string; title_ar: string | null; pinned: string | null; pinned_ar: string | null };

/** Event / venue room (brief §5.9): back with the listing name, member count and "guests only" badge, pinned live info, messages. */
export default function RoomPage({ params }: { params: { id: string } }) {
  const t = useT();
  const lang = useLang();
  const [ev, setEv] = useState<Ev | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: rid, error }, { data: { user } }] = await Promise.all([
        sb().from("events").select("id,slug,title,title_ar,pinned,pinned_ar").eq("id", params.id).maybeSingle(),
        sb().rpc("event_room", { p_event: params.id }),
        sb().auth.getUser(),
      ]);
      setEv(e as Ev | null);
      setUser(user);
      if (error || !rid) return setErr(t("notFound"));
      setRoomId(rid as string);
      const { data: c } = await sb().from("v_room_counts").select("members").eq("room_id", rid).maybeSingle();
      setCount(Number(c?.members ?? 0));
    })();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = ev ? (lang === "ar" && ev.title_ar ? ev.title_ar : ev.title) : "…";
  const pinned = ev ? (lang === "ar" && ev.pinned_ar ? ev.pinned_ar : ev.pinned) : null;
  return (
    <>
      <TopBar back={ev ? `/e/${ev.slug}` : "/"} title={title} right={<span className="tag ok">{t("verified")}</span>} />
      <div className="pad" style={{ paddingTop: 8, paddingBottom: 0 }}>
        <div className="meta">{count !== null ? `${count} ${t("going")}` : ""}</div>
      </div>
      {err && <div className="err" style={{ margin: 18 }}>{err}</div>}
      {roomId && <div style={{ paddingBottom: 140 }}><Chat roomId={roomId} user={user} next={`/room/${params.id}`} pinned={pinned} /></div>}
    </>
  );
}
