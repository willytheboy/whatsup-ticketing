import { cookies } from "next/headers";
import { t as translate, type Lang } from "./i18n";

/** Language for the current request (cookie "lang", default English). */
export function getLang(): Lang {
  return cookies().get("lang")?.value === "ar" ? "ar" : "en";
}
export const T = (lang: Lang, key: string) => translate(lang, key);
