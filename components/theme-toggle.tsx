"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
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
      className="lift focus-ring hairline grid h-9 w-9 place-items-center rounded-lg text-base text-[var(--color-mute)] hover:text-[var(--color-ink)]"
    >
      {mounted ? (dark ? "☀️" : "🌙") : "🌙"}
    </button>
  );
}
