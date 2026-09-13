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
