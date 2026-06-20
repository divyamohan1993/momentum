"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export default function BriefingModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ recap: string; topRisk: string; plan: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .briefing()
      .then((d) => setData(d))
      .catch(() => setData({ recap: "Couldn't generate the briefing right now.", topRisk: "—", plan: [] }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/65 p-4 backdrop-blur-md materialize"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Weekly briefing"
    >
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-grad text-xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          This week
        </h2>
        {loading ? (
          <p className="mt-5 text-sm text-[var(--color-mute)]">Reading your board…</p>
        ) : (
          data && (
            <div className="mt-5 space-y-4">
              <Section label="Recap" tone="ink">{data.recap}</Section>
              <Section label="Top risk" tone="warn">{data.topRisk}</Section>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">The plan</div>
                <ul className="mt-1.5 space-y-1.5">
                  {data.plan.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--color-ink)]">
                      <span className="text-[var(--color-signal)]">→</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        )}
        <button onClick={onClose} className="lift focus-ring btn-primary mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold">
          Close
        </button>
      </div>
    </div>
  );
}

function Section({ label, tone, children }: { label: string; tone: "ink" | "warn"; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
      <p className={`mt-1 text-sm ${tone === "warn" ? "text-[var(--color-warn)]" : "text-[var(--color-ink)]"}`}>{children}</p>
    </div>
  );
}
