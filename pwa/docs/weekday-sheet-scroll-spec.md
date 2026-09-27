# WeekdaySheet Scroll Specification

## Cindy's Decisions (2026-09-27)

These are the architectural decisions. Do not change them without Cindy's
explicit approval.

1. **KEEP the 30,000px fixed canvas.** The canvas is the "kept engine."
   - k=0 (this week) sits at MIDDLE (15,000px) in every sheet.
   - Past weeks above with negative offsets, future below with positive.
   - Absolute positioning. No normal-flow replacement.

2. **ONE shared scroll container.** Remove the 7 per-sheet scroll containers.
   - The strip viewport is the single vertical scroll container.
   - All seven sheets scroll together.

3. **Scroll to today on MOUNT ONLY.** No scrolling on swipe.
   - On initial load, scroll so k=0 is at the top.
   - When swiping between sheets, do NOT auto-scroll. Preserve the user's
     scroll position.

4. **Current week must be aligned.** Because k=0 is at MIDDLE in every sheet
   (fixed canvas), and there's one shared scroll container, the current week
   is aligned across sheets by construction. No per-swipe adjustment needed.

## Implementation

### WeekdaySheet
- Renders dates on the 30,000px canvas with absolute positioning.
- Accepts `past`/`future` as props (window owned by parent).
- No scroll container, no scroll init, no scroll listener.
- Reports content edges via `contentTopRef`/`contentBottomRef` (for parent's
  infinite scroll triggers).
- `data-sheet-column="{weekday}"` on root, `data-sheet-k="{k}"` on each date.

### Journal (parent)
- Owns `past`/`future` state (shared across all sheets, init 8/8).
- Owns the single scroll container (`stripViewport`, `overflow-y: auto`).
- On mount: find `[data-sheet-column="{weekday}"] [data-sheet-k="0"]`,
  set `scrollTop` to its `offsetTop`. Retry via rAF until laid out.
- Infinite scroll: single listener on the shared container. When near the
  active sheet's content top/bottom (within 800px), extend `past`/`future`
  by 8. On prepend, preserve visual position via scrollHeight delta.
- Jump-to-date: extends window via `onNeedWindow`, scrolls shared container.

## Why the canvas (not normal flow)

Normal document flow cannot guarantee alignment because past weeks have
variable heights. Sheet A might have 4000px above k=0; Sheet B might have
4500px. With a shared scroll container, swiping would show different weeks.

The fixed canvas solves this: k=0 is ALWAYS at 15,000px in every sheet,
regardless of past content heights. Alignment is structural, not calculated.
