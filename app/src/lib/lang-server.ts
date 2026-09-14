import { cookies } from "next/headers";
import { t as translate, type Lang } from "./i18n";

/** Language for the current request (cookie "lang", default English). */
export function getLang(): Lang {
  return cookies().get("lang")?.value === "ar" ? "ar" : "en";
}
/** Active city scope (cookie "city"); empty means the whole country. */
export function getCity(): string {
  return cookies().get("city")?.value ?? "";
}
export const T = (lang: Lang, key: string) => translate(lang, key);
