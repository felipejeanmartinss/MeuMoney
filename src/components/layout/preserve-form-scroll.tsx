"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const key = "meumoney:pending-form-scroll";

export function PreserveFormScroll() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const state = JSON.parse(saved) as { path: string; y: number; at: number };
        if (state.path === pathname && Date.now() - state.at < 15000 && window.location.search.includes("message=")) {
          requestAnimationFrame(() => window.scrollTo({ top: state.y, behavior: "instant" }));
          sessionStorage.removeItem(key);
        } else if (Date.now() - state.at >= 15000 || state.path !== pathname) {
          sessionStorage.removeItem(key);
        }
      } catch { sessionStorage.removeItem(key); }
    }
  }, [pathname, searchParams]);
  useEffect(() => {
    const remember = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.getAttribute("method")?.toLowerCase() === "get") return;
      sessionStorage.setItem(key, JSON.stringify({ path: window.location.pathname, y: window.scrollY, at: Date.now() }));
    };
    document.addEventListener("submit", remember, true);
    return () => document.removeEventListener("submit", remember, true);
  }, []);
  return null;
}
