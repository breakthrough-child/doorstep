# Design notes

Doorstep looks like a smart-home companion app: clean white and dark-navy surfaces, one calm teal accent, and status colours that mean one thing each. It's a "works with Ring" partner app, but it doesn't borrow Ring's branding. There's no Ring logo, no Ring colours, and compatibility is described in text only. Ring's own media keeps Ring's mandatory watermark, uncropped.

## Identity

- **Surfaces:** cool off-white page (`#f4f6fa`), white cards with a hairline border and soft shadow, and dark navy (`#0f1b2d`) for primary buttons and the explainer. Dark mode uses deep navy (`#0b1220` page, `#121b2d` cards).
- **Accent:** teal. `#0f766e` for links and active navigation in light mode, `#2dd4bf` for accent buttons and the logo.
- **Status:**
  - green `#166534`: all normal / someone came;
  - amber `#92400e` on `#fef3c7`: worth a look;
  - red `#b91c1c` on `#fee2e2`: urgent late-night activity and escalations only;
  - blue `#1d4ed8` on `#dbeafe`: information and honesty labels ("Example event", "Sample caption").
- **Type:** Inter for body text (highly legible, tabular figures for times), Manrope for headings.
- **Logo:** a simple open-door outline in teal on navy (`public/icon.svg`), our own mark.
- **Images:** Ring snapshots are always shown uncropped (`object-contain`), so the watermark stays intact. Stock photos are labelled "Example event · stock photo" and carry no Ring marks.
- **Motion:** gentle rise-in and a breathing status dot. All animation is disabled under `prefers-reduced-motion`.

## Accessibility

- Skip link and landmark regions.
- Every interactive element has an accessible name and a visible 3 px focus ring.
- Status changes are announced with `aria-live`.
- Dialogs (call sheet) use native `<dialog>` with focus on the main action; the TV alert is an `alertdialog` that focuses OK.
- A keyboard-only Tab audit (headless Chrome over the DevTools protocol) found no unnamed or ring-less stops on Today, alert detail, Care plan, onboarding or `/tv`.

## Contrast (WCAG 2.x, computed from the CSS tokens)

| Pair | Light | Dark |
|---|---|---|
| Body text (ink on paper) | 15.98 | 16.05 |
| Secondary text (ink-soft on card) | 7.58 | 8.20 |
| Secondary text on page | 7.00 | 8.92 |
| Normal / green on page | 6.59 | 10.74 |
| Green on green-soft | 6.49 | 8.43 |
| Attention / amber on amber-soft | 6.37 | 8.84 |
| Amber headline on page | 6.55 | 11.22 |
| Urgent / red on red-soft | 5.30 | 5.88 |
| White text on red (escalation) | 6.47 | 6.22 |
| Info / blue on blue-soft (honesty labels) | 5.49 | 8.36 |
| Brand teal links on page | 5.06 | 10.06 |
| Primary button (paper on ink) | 15.98 | 16.05 |
| Accent button text on teal | 10.06 | 10.06 |
| Explainer text on navy hero | 15.78 | 14.60 |
| Muted text on amber-soft | 6.81 | 7.03 |
| Muted text on red-soft | 6.20 | 7.76 |

Every pair passes AA for normal text (≥ 4.5:1). The lowest is 5.06:1.
