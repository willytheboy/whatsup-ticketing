"use client";
import { useState } from "react";
import { useT } from "@/lib/lang";

/** Map card (brief §5.3): a single OSM tile, a pin, the address and Directions. The tile hides itself if it cannot load. */
export default function MapCard({ lat, lng, address }: { lat: number; lng: number; address: string }) {
  const t = useT();
  const [ok, setOk] = useState(true);
  const z = 15, n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  const isApple = typeof navigator !== "undefined" && /iPhone|iPad|Mac/.test(navigator.userAgent);
  const maps = isApple ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(address)}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return (
    <div className="map" style={{ marginTop: 0 }}>
      {ok ? <img alt="" src={`https://tile.openstreetmap.org/${z}/${x}/${y}.png`} onError={() => setOk(false)} /> : <div style={{ height: 150 }} />}
      <span className="pinmark">📍</span>
      <div className="addr">
        <div>
          <div style={{ fontWeight: 600 }}>{t("location")}</div>
          <div className="meta">{address}</div>
        </div>
        <a className="btn line sm" href={maps} target="_blank" rel="noopener">{t("directions")}</a>
      </div>
    </div>
  );
}
