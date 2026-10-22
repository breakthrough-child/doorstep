"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DoorIcon, HeartIcon, ListIcon, NoteIcon, SunIcon } from "./icons";
import { ModeBadge } from "./ModeBadge";
import { useAppState } from "./state";
import { StoryBanner } from "./Intro";
import { TokenBanner } from "./TokenBanner";

const NAV = [
  { href: "/", label: "Today", Icon: SunIcon },
  { href: "/alerts", label: "Alerts", Icon: ListIcon },
  { href: "/digest", label: "Digest", Icon: NoteIcon },
  { href: "/care-plan", label: "Care plan", Icon: HeartIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, error } = useAppState();


  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col md:gap-8 md:border-r md:border-line md:px-5 md:py-7 sticky top-0 h-dvh">
        <Brand />
        <nav aria-label="Main">
          <ul className="flex flex-col gap-1">
            {NAV.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[1.02rem] transition-colors ${
                    active(href) ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-ink-soft hover:bg-card/60 hover:text-ink"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                  {href === "/alerts" && !!state?.activeAlertCount && <Count n={state.activeAlertCount} urgent={state.status.level === "urgent"} />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto space-y-3 text-sm text-ink-soft">
          {state && <ModeBadge state={state} />}
          <p className="leading-snug">
            Caring for <span className="text-ink">{state?.parentName ?? "…"}</span>
            <br />
            from {state?.familyName ?? "…"}&rsquo;s phone
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-24 md:pb-10">
        {/* Header (mobile) */}
        <header className="flex items-center justify-between gap-3 px-4 pt-4 md:hidden">
          <Brand compact />
          {state && <ModeBadge state={state} compact />}
        </header>

        {state && <StoryBanner parentName={state.parentName} familyName={state.familyName} />}
        <TokenBanner />
        {error && (
          <p role="status" className="mx-4 mt-3 rounded-xl bg-amber-soft px-4 py-2 text-sm text-amber md:mx-10">
            Can&rsquo;t reach the Doorstep server ({error}). Retrying…
          </p>
        )}

        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 md:px-10 md:pt-9">
          {children}
        </main>
      </div>

      {/* Bottom tab bar (mobile) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs ${active(href) ? "text-sage" : "text-ink-soft"}`}
              >
                <Icon className="h-6 w-6" />
                <span className={active(href) ? "font-bold" : ""}>{label}</span>
                {href === "/alerts" && !!state?.activeAlertCount && (
                  <span className="absolute right-[calc(50%-22px)] top-1.5">
                    <Count n={state.activeAlertCount} urgent={state.status.level === "urgent"} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Count({ n, urgent }: { n: number; urgent: boolean }) {
  return (
    <span
      className={`ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[0.72rem] font-bold leading-5 ${
        urgent ? "bg-rose text-card" : "bg-amber text-card"
      }`}
      aria-label={`${n} active`}
    >
      {n}
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="Doorstep home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-sage text-paper">
        <DoorIcon className="h-5 w-5" />
      </span>
      <span className={`font-display ${compact ? "text-xl" : "text-2xl"} text-ink`}>Doorstep</span>
    </Link>
  );
}
