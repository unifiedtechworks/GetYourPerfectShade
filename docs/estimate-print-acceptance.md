# Estimate browser-print acceptance

`/app/estimates/{estimateId}/preview` is the protected browser-print surface for
a saved estimate. Screen behavior keeps the normal application navigation and
preview actions. Print behavior is deliberately scoped to this route.

## Letter print behavior

- `@page` requests US Letter portrait with 0.60-inch top, 0.70-inch side, and
  0.65-inch bottom margins, matching the retained Sheri bid geometry.
- The protected sidebar, application navigation, account/team links, sign-out
  control, preview action bar, application background, outer padding, border,
  and shadow do not print.
- The screen-only draft-warning banner does not print; draft or issued status
  remains present in the proposal's upper-right metadata.
- The proposal expands to the complete printable width while retaining the
  approved blue hierarchy, table fills, borders, and right-aligned amounts.
- Pricing rows and totals avoid splitting. Table headers repeat if a long
  pricing table must continue on another sheet.
- Section headings stay with following content where Chromium can honor the
  break hint. The Authorization and Acceptance block is kept together when
  sufficient space is available.
- The proposal footer is fixed into the reserved bottom margin so Chromium
  repeats it on each printed sheet.

The previous rule treated every proposal section and table as indivisible.
That pushed long but splittable content to later sheets and produced a third
sheet for the representative acceptance estimate. The corrected rule allows
normal paragraph flow while protecting headings, table rows, totals, and the
authorization block. At Letter size, the same representative estimate prints
in two sheets, consistent with the density of
`2026-08-01 - test - Perfect Shade Bid (3).docx`.

## Browser-controlled headers and footers

The browser owns its print-dialog header and footer content, including URL,
date, document title, and page numbers. Page CSS cannot reliably disable those
fields. For a clean client proposal in Chrome or Edge, open **More settings** in
the print dialog and turn off **Headers and footers**. Keep paper size set to
**Letter** and scale at **Default** unless a specific printer requires another
setting.

Browser font metrics and pagination can differ slightly across Chromium
versions and printer drivers. The CSS requests the approved page geometry and
break behavior but does not claim control over browser-added print metadata.
