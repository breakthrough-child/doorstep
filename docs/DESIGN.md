# Design notes

Doorstep should feel like a calm companion, not a security dashboard.

- **Palette:** warm paper and soft ink. Sage means "all is well", amber means "worth a look", and rose is reserved for genuine late-night concerns and escalations. Blue marks honesty labels: simulated, recorded, sample caption.
- **Type:** Fraunces for headings and times; Atkinson Hyperlegible Next for body text. Atkinson was designed for low-vision readers; its slashed zero is deliberate.
- **Images:** Ring snapshots are always shown uncropped (`object-contain`), so the mandatory watermark stays intact.
- **Motion:** gentle rise-in and a breathing status dot. All animation is disabled under `prefers-reduced-motion`.
- **Accessibility:**
  - skip link and landmark regions;
  - every interactive element has an accessible name and a visible 3 px focus ring;
  - status changes are announced with `aria-live`;
  - the TV alert is an `alertdialog` that focuses its OK button.
  - A keyboard-only Tab audit (headless Chrome over the DevTools protocol) found no unnamed or ring-less stops on Today, alert detail, Care plan, onboarding or `/tv`.

## Contrast (WCAG 2.x, computed from the CSS tokens)

| Pair | Light | Dark |
|---|---|---|
| ink on paper | 13.35 | 14.80 |
| ink-soft on paper | 6.80 | 8.97 |
| ink-soft on card | 7.52 | 8.10 |
| sage on paper | 6.07 | 9.62 |
| sage on sage-soft | 5.53 | 7.18 |
| amber on amber-soft | 5.30 | 7.34 |
| amber on paper | 5.83 | 9.56 |
| rose on rose-soft | 5.47 | 7.15 |
| card text on rose (escalation banner) | 7.00 | 7.91 |
| sky on sky-soft (honesty labels) | 5.67 | 8.07 |
| ink-soft on amber-soft / rose-soft | 6.18 / 5.88 | 6.89 / 7.32 |

All pairs pass AA for normal text (≥ 4.5:1).
