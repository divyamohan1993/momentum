"use client";

import { useEffect, useState } from "react";

/**
 * Follows the OS theme by default and live-updates with it; a manual toggle sets an
 * explicit preference that then wins (stored in localStorage).
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      // Only follow the OS while the user hasn't picked a mode explicitly.
      if (!localStorage.getItem("momentum-theme")) {
        document.documentElement.classList.toggle("dark", mq.matches);
        setDark(mq.matches);
      }
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  function toggle() {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try {
      localStorage.setItem("momentum-theme", d ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="lift focus-ring hairline grid h-9 w-9 place-items-center rounded-lg text-base text-[var(--color-mute)] hover:text-[var(--color-ink)]"
    >
      {mounted ? (dark ? "☀️" : "🌙") : "🌙"}
    </button>
  );
}
