"use client";

import { useEffect, useId, useState } from "react";
import type { CarePlan, Contact, Visitor } from "@/lib/types";
import { postJson } from "./state";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ZONES = [
  "Africa/Lagos",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

type Issue = { path: string; message: string };

export function CarePlanForm({ onSaved, submitLabel = "Save care plan" }: { onSaved?: (p: CarePlan) => void; submitLabel?: string }) {
  const [plan, setPlan] = useState<CarePlan | null>(null);
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/care-plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { plan: CarePlan; devices: Array<{ id: string; name: string }> }) => {
        setPlan(d.plan);
        setDevices(d.devices.filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i));
      });
  }, []);

  if (!plan) return <div className="h-96 rounded-3xl bg-line/40" aria-busy="true" />;

  const set = <K extends keyof CarePlan>(k: K, v: CarePlan[K]) => setPlan({ ...plan, [k]: v });
  const setContact = (i: number, c: Partial<Contact>) =>
    set(
      "contacts",
      plan.contacts.map((x, j) => (j === i ? { ...x, ...c } : c.escalation ? { ...x, escalation: false } : x)),
    );
  const setVisitor = (i: number, v: Partial<Visitor>) =>
    set("visitors", plan.visitors.map((x, j) => (j === i ? { ...x, ...v } : x)));
  const err = (p: string) => issues.find((x) => x.path === p)?.message;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setIssues([]);
    try {
      const res = await postJson<{ plan: CarePlan }>("/api/care-plan", plan, "PUT");
      setPlan(res.plan);
      setMsg("Saved. Doorstep will use this from now on.");
      onSaved?.(res.plan);
    } catch (e) {
      const data = (e as { data?: { issues?: Issue[] } }).data;
      setIssues(data?.issues ?? []);
      setMsg(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-8" noValidate>
      <Fieldset legend="Who you're caring for">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parent's name" error={err("parentName")}>
            {(id) => <input id={id} className={input} value={plan.parentName} onChange={(e) => set("parentName", e.target.value)} />}
          </Field>
          <Field label="Your name" error={err("familyName")}>
            {(id) => <input id={id} className={input} value={plan.familyName} onChange={(e) => set("familyName", e.target.value)} />}
          </Field>
          <Field label="Their time zone" error={err("timeZone")} hint="All times below are in this zone.">
            {(id) => (
              <select id={id} className={input} value={plan.timeZone} onChange={(e) => set("timeZone", e.target.value)}>
                {[...new Set([plan.timeZone, ...ZONES])].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Front-door camera" hint={devices.length ? undefined : "Connect Ring to choose a camera."}>
            {(id) => (
              <select id={id} className={input} value={plan.deviceId ?? ""} onChange={(e) => set("deviceId", e.target.value || null)}>
                <option value="">Any / first camera</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="When to let you know">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quiet morning: no activity by" error={err("quietMorningBy")}>
            {(id) => <input id={id} type="time" className={input} value={plan.quietMorningBy} onChange={(e) => set("quietMorningBy", e.target.value)} />}
          </Field>
          <Field label="Package left out after (hours)" error={err("packageHours")}>
            {(id) => (
              <input id={id} type="number" min={0.5} max={24} step={0.5} className={input} value={plan.packageHours} onChange={(e) => set("packageHours", Number(e.target.value))} />
            )}
          </Field>
          <Field label="Late night starts" error={err("lateNightStart")}>
            {(id) => <input id={id} type="time" className={input} value={plan.lateNightStart} onChange={(e) => set("lateNightStart", e.target.value)} />}
          </Field>
          <Field label="Late night ends" error={err("lateNightEnd")}>
            {(id) => <input id={id} type="time" className={input} value={plan.lateNightEnd} onChange={(e) => set("lateNightEnd", e.target.value)} />}
          </Field>
          <Field label="It's dark by" error={err("darkAt")} hint="A package still out after this is flagged.">
            {(id) => <input id={id} type="time" className={input} value={plan.darkAt} onChange={(e) => set("darkAt", e.target.value)} />}
          </Field>
          <Field label="Doorbell answered within (minutes)" error={err("doorbellAnswerMinutes")}>
            {(id) => (
              <input id={id} type="number" min={1} max={30} className={input} value={plan.doorbellAnswerMinutes} onChange={(e) => set("doorbellAnswerMinutes", Number(e.target.value))} />
            )}
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="Contacts">
        <p className="-mt-2 mb-4 text-sm text-ink-soft">
          People you can call straight from an alert. Pick one <b>second family contact</b>: if an urgent alert goes unacknowledged for 15
          minutes, Doorstep marks it as escalated to them (shown in the app; Doorstep doesn&rsquo;t send texts or emails).
        </p>
        <ul className="space-y-3">
          {plan.contacts.map((c, i) => (
            <li key={c.id} className="rounded-2xl border border-line bg-paper p-4">
              <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_auto]">
                <Field label="Name" error={err(`contacts.${i}.name`)}>
                  {(id) => <input id={id} className={input} value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />}
                </Field>
                <Field label="Phone" error={err(`contacts.${i}.phone`)}>
                  {(id) => (
                    <input id={id} type="tel" inputMode="tel" className={input} value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
                  )}
                </Field>
                <Field label="Role">
                  {(id) => (
                    <select id={id} className={input} value={c.role} onChange={(e) => setContact(i, { role: e.target.value as Contact["role"] })}>
                      <option value="parent">{plan.parentName} (parent)</option>
                      <option value="aide">Aide / carer</option>
                      <option value="neighbour">Neighbour</option>
                      <option value="family">Family</option>
                      <option value="other">Other</option>
                    </select>
                  )}
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="escalation"
                    checked={c.escalation}
                    onChange={() => setContact(i, { escalation: true })}
                    className="h-4 w-4 accent-[var(--sage)]"
                  />
                  Second family contact (urgent alerts escalate here)
                </label>
                <button type="button" onClick={() => set("contacts", plan.contacts.filter((_, j) => j !== i))} className="ml-auto text-sm text-ink-soft underline underline-offset-2">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        {err("contacts") && <p className="mt-2 text-sm text-rose">{err("contacts")}</p>}
        <button
          type="button"
          onClick={() => set("contacts", [...plan.contacts, { id: `c${Date.now().toString(36)}`, name: "", role: "other", phone: "", escalation: false }])}
          className="mt-3 rounded-full border border-dashed border-ink-soft px-4 py-2 text-sm font-bold text-ink"
        >
          + Add a contact
        </button>
      </Fieldset>

      <Fieldset legend="Scheduled visitors">
        <p className="-mt-2 mb-4 text-sm text-ink-soft">
          Home aides, nurses, meal deliveries. If nobody comes to the door during the window (plus {plan.visitGraceMinutes} minutes&rsquo; grace),
          you&rsquo;ll get a gentle alert. Names are just labels for you — Doorstep never recognises who arrives.
        </p>
        <ul className="space-y-3">
          {plan.visitors.map((v, i) => (
            <li key={v.id} className="rounded-2xl border border-line bg-paper p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <Field label="Name" error={err(`visitors.${i}.name`)}>
                  {(id) => <input id={id} className={input} value={v.name} onChange={(e) => setVisitor(i, { name: e.target.value })} />}
                </Field>
                <Field label="From" error={err(`visitors.${i}.windowStart`)}>
                  {(id) => <input id={id} type="time" className={input} value={v.windowStart} onChange={(e) => setVisitor(i, { windowStart: e.target.value })} />}
                </Field>
                <Field label="Until" error={err(`visitors.${i}.windowEnd`)}>
                  {(id) => <input id={id} type="time" className={input} value={v.windowEnd} onChange={(e) => setVisitor(i, { windowEnd: e.target.value })} />}
                </Field>
              </div>
              <fieldset className="mt-3">
                <legend className="sr-only">Days for {v.name}</legend>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DAYS.map((d, di) => {
                    const on = v.days.includes(di);
                    return (
                      <label key={d} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? "border-sage bg-sage-soft font-bold text-sage" : "border-line bg-card text-ink-soft"}`}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() => setVisitor(i, { days: on ? v.days.filter((x) => x !== di) : [...v.days, di].sort() })}
                        />
                        {d}
                      </label>
                    );
                  })}
                  <button type="button" onClick={() => set("visitors", plan.visitors.filter((_, j) => j !== i))} className="ml-auto text-sm text-ink-soft underline underline-offset-2">
                    Remove
                  </button>
                </div>
                {err(`visitors.${i}.days`) && <p className="mt-1 text-sm text-rose">{err(`visitors.${i}.days`)}</p>}
              </fieldset>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            set("visitors", [...plan.visitors, { id: `v${Date.now().toString(36)}`, name: "New visitor", days: [1, 2, 3, 4, 5], windowStart: "10:00", windowEnd: "11:00" }])
          }
          className="mt-3 rounded-full border border-dashed border-ink-soft px-4 py-2 text-sm font-bold text-ink"
        >
          + Add a visitor
        </button>
      </Fieldset>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card/95 p-3 backdrop-blur md:bottom-4">
        <button disabled={busy} className="rounded-full bg-ink px-6 py-2.5 font-bold text-paper disabled:opacity-50">
          {busy ? "Saving…" : submitLabel}
        </button>
        {msg && (
          <p role="status" className={issues.length ? "text-rose" : "text-sage"}>
            {msg}
          </p>
        )}
      </div>
    </form>
  );
}

const input = "w-full rounded-xl border border-line bg-card px-3 py-2 text-ink";

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <legend className="font-display px-1 text-xl">{legend}</legend>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-ink">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
      {error && (
        <p className="mt-1 text-sm text-rose" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
