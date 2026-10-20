"use client";

import { CarePlanForm } from "@/components/CarePlanForm";
import { useAppState } from "@/components/state";

export default function CarePlanPage() {
  const { refresh } = useAppState();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Care plan</h1>
        <p className="mt-2 text-ink-soft">Tell Doorstep what a normal day looks like, so it only speaks up when something doesn&rsquo;t fit.</p>
      </header>
      <CarePlanForm onSaved={() => refresh()} />
    </div>
  );
}
