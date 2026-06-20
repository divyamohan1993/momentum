"use client";

import { useState } from "react";
import { Command } from "cmdk";
import type { Task } from "@/lib/types";
import { api } from "@/lib/client";

export default function CommandPalette({
  tasks,
  brain,
  onClose,
  onDone,
  onFocus,
}: {
  tasks: Task[];
  brain: boolean;
  onClose: () => void;
  onDone: (msg?: string) => void;
  onFocus: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const query = q.trim();
  const matches = query
    ? tasks.filter((t) => t.title.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : tasks.slice(0, 6);

  async function run(kind: "capture" | "command") {
    if (!query || busy) return;
    setBusy(true);
    try {
      if (kind === "capture") {
        const r = await api.capture(query);
        onDone(`✓ Added ${r.count}`);
      } else {
        const r = await api.command(query);
        const applied = r.outcomes.filter((o) => o.status === "applied" || o.status === "created").length;
        onDone(r.degraded ? "Brain offline" : applied ? `✓ ${applied} applied` : "No actions matched");
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm materialize" onClick={onClose}>
      <Command
        shouldFilter={false}
        className="glass w-full max-w-xl overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        loop
      >
        <Command.Input
          autoFocus
          value={q}
          onValueChange={setQ}
          placeholder="Search cards, capture a thought, or speak a command…"
          className="w-full border-b border-[var(--color-edge)] bg-transparent px-5 py-4 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-faint)] outline-none"
        />
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-faint)]">No matches.</Command.Empty>

          {query && (
            <Command.Group heading="Act on this text" className="px-1 text-[11px] text-[var(--color-faint)]">
              <Item onSelect={() => run("capture")}>✏️ Capture “{query}”</Item>
              {brain && <Item onSelect={() => run("command")}>🎙️ Run command “{query}”</Item>}
            </Command.Group>
          )}

          {matches.length > 0 && (
            <Command.Group heading="Jump to card" className="px-1 text-[11px] text-[var(--color-faint)]">
              {matches.map((t) => (
                <Item
                  key={t.id}
                  onSelect={() => {
                    onFocus(t.id);
                    onClose();
                  }}
                >
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-signal)]" />
                  {t.title}
                  <span className="ml-auto text-[10px] text-[var(--color-faint)]">{t.status}</span>
                </Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-1 rounded-lg px-3 py-2.5 text-sm text-[var(--color-ink)] data-[selected=true]:bg-[var(--color-signal)]/12 data-[selected=true]:text-[var(--color-signal)]"
    >
      {children}
    </Command.Item>
  );
}
