"use client";
import { useEffect, useState } from "react";
import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth, setPersistence, inMemoryPersistence, GoogleAuthProvider, signInWithPopup, signOut, type Auth } from "firebase/auth";

export default function GoogleLogin({ config, enabled }: { config: FirebaseOptions; enabled: boolean }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const app = getApps().find((a) => a.name === "momentum-login") ?? initializeApp(config, "momentum-login");
    const client = getAuth(app);
    setPersistence(client, inMemoryPersistence).then(() => { if (active) setAuth(client); })
      .catch(() => { if (active) setError("Google sign-in could not load. Please refresh."); });
    return () => { active = false; };
  }, [config, enabled]);

  async function login() {
    if (!auth || busy) return;
    setBusy(true); setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      // Open from the user's click before waiting on network work (popup blockers).
      const popup = signInWithPopup(auth, provider);
      const challenge = fetch("/api/auth/google/challenge", { method: "POST", headers: { "Content-Type": "application/json" } })
        .then(async (r) => { if (!r.ok) throw new Error("challenge"); return r.json() as Promise<{ csrf: string }>; });
      const [credential, proof] = await Promise.allSettled([popup, challenge]);
      if (credential.status !== "fulfilled" || proof.status !== "fulfilled") throw new Error("sign-in incomplete");
      const idToken = await credential.value.user.getIdToken();
      const r = await fetch("/api/auth/google", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, csrf: proof.value.csrf, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      if (!r.ok) { setError(r.status === 429 ? "Please wait a moment and try again." : "Sign in with a verified Google account to continue."); return; }
      await signOut(auth).catch(() => {});
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        for (const notification of await registration?.getNotifications() ?? []) notification.close();
      }
      try { localStorage.setItem("momentum-auth-change", crypto.randomUUID()); } catch {}
      window.location.replace("/");
    } catch {
      setError("Sign-in was not completed. Please try again and allow the Google popup.");
    } finally {
      await signOut(auth).catch(() => {});
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <section className="glass materialize w-full max-w-sm rounded-3xl p-8 text-center" style={{ boxShadow: "0 40px 130px -40px rgba(255,77,141,0.45)" }}>
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center" style={{ animation: "floaty 5s ease-in-out infinite" }}><RingMark /></div>
        <h1 className="text-grad text-2xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Momentum</h1>
        <p className="mt-1 text-sm text-[var(--color-mute)]">Your AI chief of staff.</p>
        <button type="button" onClick={login} disabled={!auth || busy} className="focus-ring mt-7 flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 py-3 font-medium text-[#1f1f1f] disabled:opacity-50">
          <GoogleMark />{busy ? "Signing in…" : "Continue with Google"}
        </button>
        {!enabled && <p role="alert" className="mt-3 text-sm text-[var(--color-magenta)]">Google sign-in is temporarily unavailable.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-[var(--color-magenta)]">{error}</p>}
        <p className="mt-6 text-xs text-[var(--color-faint)]">Your Google account. Your private workspace. Always free.</p>
      </section>
    </main>
  );
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
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
