"use client";

import { useEffect, useState } from "react";
import { api, type CalToday } from "@/lib/client";
import { formatIst } from "@/lib/time";

const timeOnly = (iso: string) => formatIst(iso).split(", ")[1]?.replace(" IST", "") ?? formatIst(iso);

export default function CalendarPanel({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const [data, setData] = useState<CalToday | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .calendarToday()
      .then(setData)
      .catch(() => setData({ enabled: true, connected: false, busy: [], free: [] }))
      .finally(() => setLoading(false));
  }, []);

  const longest = data?.free
    ?.slice()
    .sort((a, b) => new Date(b.end).getTime() - new Date(b.start).getTime() - (new Date(a.end).getTime() - new Date(a.start).getTime()))[0];

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/65 p-4 backdrop-blur-md materialize" onClick={onClose} role="dialog" aria-modal="true" aria-label="Calendar">
      <div className="glass max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-grad text-xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Today&apos;s calendar
        </h2>

        {loading ? (
          <p className="mt-5 text-sm text-[var(--color-mute)]">Checking your calendar…</p>
        ) : !data?.connected ? (
          <div className="mt-4">
            <p className="text-sm text-[var(--color-mute)]">
              Connect Google Calendar so Momentum schedules deep-work into your free blocks and quick wins between meetings.
            </p>
            <a href="/api/calendar/connect" className="lift focus-ring btn-primary mt-4 inline-block rounded-xl px-4 py-3 text-sm font-semibold">
              Connect Google Calendar
            </a>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {longest && (
              <p className="text-sm text-[var(--color-ink)]">
                🎯 Longest free block: <b>{timeOnly(longest.start)}–{timeOnly(longest.end)}</b> — do your hardest deep-work card then.
              </p>
            )}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">Free blocks left today</div>
              {data.free.length ? (
                <ul className="mt-1.5 space-y-1">
                  {data.free.map((f, i) => (
                    <li key={i} className="text-sm text-[var(--color-go)]">
                      ● {timeOnly(f.start)}–{timeOnly(f.end)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-[var(--color-faint)]">No open blocks left today.</p>
              )}
            </div>
            <button
              onClick={async () => {
                await api.calendarDisconnect().catch(() => {});
                onChange();
                onClose();
              }}
              className="focus-ring text-xs text-[var(--color-faint)] hover:text-[var(--color-warn)]"
            >
              Disconnect calendar
            </button>
          </div>
        )}

        <button onClick={onClose} className="lift focus-ring hairline mt-6 w-full rounded-xl px-4 py-3 text-sm font-medium text-[var(--color-ink)]">
          Close
        </button>
      </div>
    </div>
  );
}
