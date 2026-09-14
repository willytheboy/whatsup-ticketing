import { cookies } from "next/headers";
import { t as translate, type Lang } from "./i18n";
import { brandify, type Brand } from "./features";
import { getTenantConfig } from "./features-server";

/** Language for the current request (cookie "lang", default English). */
export function getLang(): Lang {
  return cookies().get("lang")?.value === "ar" ? "ar" : "en";
}
/** Active city scope (cookie "city"); empty means the whole country. */
export function getCity(): string {
  return cookies().get("city")?.value ?? "";
}
export const T = (lang: Lang, key: string) => translate(lang, key);
/** Brand-aware translator for server components: `const t = await getT(lang)`. */
export async function getT(lang: Lang): Promise<(key: string) => string> {
  const { brand } = await getTenantConfig();
  return (key: string) => brandify(translate(lang, key), brand);
}
export const tb = (lang: Lang, brand: Brand) => (key: string) => brandify(translate(lang, key), brand);
