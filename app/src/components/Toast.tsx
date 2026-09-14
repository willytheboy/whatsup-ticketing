"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

const Ctx = createContext<(msg: string) => void>(() => {});

/** Black bottom toast, 2.2 s, confirms every state change (brief §7). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2200);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={`toast ${show ? "show" : ""}`} role="status">{msg}</div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
