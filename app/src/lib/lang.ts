"use client";
import { useEffect, useState } from "react";
import { t, type Lang } from "./i18n";

/** Current UI language, read from <html lang> after hydration (server-rendered from the cookie). */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    setLang(document.documentElement.lang === "ar" ? "ar" : "en");
  }, []);
  return lang;
}
export function useT() {
  const lang = useLang();
  return (key: string) => t(lang, key);
}
/** Persist the language choice and reload so the server re-renders with the right direction. */
export function setLang(lang: Lang) {
  document.cookie = `lang=${lang};path=/;max-age=31536000;samesite=lax`;
  location.reload();
}
/** Persist the city scope (empty = whole country) and reload. */
export function setCity(city: string) {
  document.cookie = `city=${encodeURIComponent(city)};path=/;max-age=31536000;samesite=lax`;
  location.reload();
}
/** Pick the localised field of a row (title/title_ar …). */
export function pick<T extends Record<string, any>>(lang: Lang, row: T | null | undefined, key: string): string {
  if (!row) return "";
  return (lang === "ar" && row[`${key}_ar`]) || row[key] || "";
}
