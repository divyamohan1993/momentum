"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (r.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const data = (await r.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
      if (data.error === "locked" || data.error === "rate")
        setError(`Too many attempts. Try again in ${data.retryAfter ?? 60}s.`);
      else setError("Incorrect passphrase.");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form
        onSubmit={submit}
        className="glass materialize w-full max-w-sm rounded-3xl p-8 text-center"
        style={{ boxShadow: "0 40px 130px -40px rgba(255,77,141,0.45)" }}
      >
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center" style={{ animation: "floaty 5s ease-in-out infinite" }}>
          <RingMark />
        </div>
        <h1 className="text-grad text-2xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Momentum
        </h1>
        <p className="mt-1 text-sm text-[var(--color-mute)]">Your AI chief of staff.</p>

        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Owner passphrase"
          className="focus-ring mt-7 w-full rounded-xl border border-[var(--color-edge)] bg-[var(--color-haze)] px-4 py-3 text-center text-[var(--color-ink)] placeholder:text-[var(--color-faint)] outline-none"
        />

        {error && <p className="mt-3 text-sm text-[var(--color-magenta)]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !passphrase}
          className="lift focus-ring btn-primary mt-5 w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-40"
        >
          {busy ? "Verifying…" : "Enter"}
        </button>
        <p className="mt-6 text-xs text-[var(--color-faint)]">
          Single-owner access. Every request is owner-locked.
        </p>
      </form>
    </main>
  );
}

function RingMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a59" />
          <stop offset="0.55" stopColor="#ff4d8d" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--color-edge)" strokeWidth="5" />
      <circle
        cx="32"
        cy="32"
        r="26"
        fill="none"
        stroke="url(#g)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="124 200"
        transform="rotate(-90 32 32)"
      />
      <circle cx="32" cy="6" r="5.5" fill="url(#g)" />
    </svg>
  );
}
