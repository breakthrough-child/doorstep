"use client";

import { useId, useState } from "react";
import type { Alert, Contact, Visitor } from "@/lib/types";
import { CallSheet } from "./CallSheet";
import { CheckIcon, ClockIcon, PhoneIcon } from "./icons";
import { postJson } from "./state";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Contacts worth calling for an alert: the parent first, then the relevant helper, then others. */
export function callOrder(contacts: Contact[], rule: Alert["rule"]): Contact[] {
  const rank = (c: Contact) =>
    c.role === "parent" ? 0 : rule === "missed_visit" && c.role === "aide" ? 1 : c.role === "neighbour" ? 2 : c.role === "aide" ? 3 : 4;
  return [...contacts].filter((c) => !c.escalation || c.role !== "family").sort((a, b) => rank(a) - rank(b));
}

export function CaretakerActions({
  alert,
  contacts,
  compact = false,
  suggestedVisitor = null,
  onDone,
}: {
  alert: Alert;
  contacts: Contact[];
  compact?: boolean;
  suggestedVisitor?: Omit<Visitor, "id" | "name"> | null;
  onDone: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expectOpen, setExpectOpen] = useState(false);
  const [calling, setCalling] = useState<Contact | null>(null);
  const resolved = alert.status === "resolved";
  const callees = callOrder(contacts, alert.rule).slice(0, compact ? 1 : 3);

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await postJson(`/api/alerts/${encodeURIComponent(alert.id)}`, body);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (resolved)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm text-sage">
          <CheckIcon className="h-4 w-4" /> Sorted
        </span>
        <button onClick={() => act("reopen", { action: "reopen" })} disabled={!!busy} className="text-sm text-ink-soft underline underline-offset-2">
          Reopen
        </button>
      </div>
    );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {callees.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setCalling(c)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ${
              i === 0 ? "bg-ink text-paper" : "border border-line bg-card text-ink hover:border-ink-soft"
            }`}
            aria-haspopup="dialog"
          >
            <PhoneIcon className="h-4 w-4" /> Call {c.role === "parent" ? c.name : shortName(c.name)}
          </button>
        ))}
        <button
          onClick={() => (suggestedVisitor && !compact ? setExpectOpen((v) => !v) : act("expected", { action: "expected" }))}
          disabled={!!busy}
          aria-expanded={suggestedVisitor && !compact ? expectOpen : undefined}
          className="rounded-full border border-line bg-card px-4 py-2 text-sm font-bold text-ink hover:border-ink-soft disabled:opacity-50"
        >
          That was expected
        </button>
        {!alert.snoozedUntil && (
          <button
            onClick={() => act("remind", { action: "remind", minutes: 30 })}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-sm font-bold text-ink hover:border-ink-soft disabled:opacity-50"
          >
            <ClockIcon className="h-4 w-4" /> Remind me in 30 min
          </button>
        )}
      </div>
      {expectOpen && suggestedVisitor && (
        <ExpectedForm suggested={suggestedVisitor} busy={!!busy} onSubmit={(addVisitor) => act("expected", { action: "expected", addVisitor })} />
      )}
      {calling && (
        <CallSheet
          contact={calling}
          onClose={() => setCalling(null)}
          onLogged={() => void act("call", { action: "call", contactId: calling.id })}
        />
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose">
          {error}
        </p>
      )}
    </div>
  );
}

function ExpectedForm({
  suggested,
  busy,
  onSubmit,
}: {
  suggested: Omit<Visitor, "id" | "name">;
  busy: boolean;
  onSubmit: (addVisitor?: Omit<Visitor, "id">) => void;
}) {
  const id = useId();
  const [add, setAdd] = useState(false);
  const [name, setName] = useState("");
  const [from, setFrom] = useState(suggested.windowStart);
  const [to, setTo] = useState(suggested.windowEnd);
  return (
    <form
      className="mt-3 space-y-3 rounded-2xl border border-line bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(add ? { name: name.trim() || "Expected visitor", days: suggested.days, windowStart: from, windowEnd: to } : undefined);
      }}
    >
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={add} onChange={(e) => setAdd(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--sage)]" />
        <span>
          Add this visitor to the schedule ({suggested.days.map((d) => DAYS[d]).join(", ")}), so Doorstep expects them next time
        </span>
      </label>
      {add && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label htmlFor={`${id}-n`} className="mb-1 block text-xs font-bold">
              Who is it?
            </label>
            <input id={`${id}-n`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night nurse" className="w-full rounded-xl border border-line bg-card px-3 py-2" />
          </div>
          <div>
            <label htmlFor={`${id}-f`} className="mb-1 block text-xs font-bold">
              From
            </label>
            <input id={`${id}-f`} type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-line bg-card px-3 py-2" />
          </div>
          <div>
            <label htmlFor={`${id}-t`} className="mb-1 block text-xs font-bold">
              Until
            </label>
            <input id={`${id}-t`} type="time" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-line bg-card px-3 py-2" />
          </div>
        </div>
      )}
      <button disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-50">
        {add ? "Mark expected & add to schedule" : "Mark as expected"}
      </button>
    </form>
  );
}

function shortName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "");
}
