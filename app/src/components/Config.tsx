"use client";
import { createContext, useContext } from "react";
import TopBar from "./TopBar";
import { DEFAULT_CONFIG, tabVisible, type FeatureId, type TabId, type TenantConfig } from "@/lib/features";

const Ctx = createContext<TenantConfig>(DEFAULT_CONFIG);

/** The root layout loads the tenant config on the server and hands it to every client component through this provider. */
export function ConfigProvider({ value, children }: { value: TenantConfig; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useConfig = () => useContext(Ctx);
export const useBrand = () => useContext(Ctx).brand;
export const useFeature = (id: FeatureId) => useContext(Ctx).features[id];
export const useTab = (id: TabId) => tabVisible(useContext(Ctx), id);

/** Renders children only when the feature is on; otherwise `fallback` (default nothing). */
export function Feature({ id, fallback = null, children }: { id: FeatureId; fallback?: React.ReactNode; children: React.ReactNode }) {
  const on = useFeature(id);
  return <>{on ? children : fallback}</>;
}

/** What a page renders when its feature is off for this tenant: a bar back home and a quiet empty state. */
export function FeatureOff({ back = "/" }: { back?: string }) {
  const { brand } = useConfig();
  return (
    <>
      <TopBar back={back} title={brand.name} />
      <main>
        <div className="empty" style={{ padding: "40px 16px" }}>
          <div style={{ fontSize: 28 }}>🙈</div>
          <p style={{ margin: "8px 0 0" }}>Not available in {brand.country} yet.</p>
        </div>
      </main>
    </>
  );
}
