# WeekdaySheet Scroll Specification

## Architecture: Shared Scroll Container with Normal Flow

Seven weekday sheets sit side-by-side in a horizontal strip. They share ONE
vertical scroll container (the strip viewport). Dates render in normal
document flow — no fixed canvas, no absolute positioning.

### Invariants (must always hold)

1. **Single scroll container**: The strip viewport (`stripViewport`) is the
   only vertical scroll container. It has `overflow-y: auto` and
   `touchAction: pan-y`. There are no per-sheet scroll containers.

2. **Shared window**: All seven sheets render the same `past`/`future` week
   window (owned by Journal). When the window extends, all sheets extend
   together.

3. **k=0 alignment on mount**: On initial load, the shared container scrolls
   so the active sheet's k=0 (this week) is at the top of the viewport.
   The init finds `[data-sheet-column="{weekday}"] [data-sheet-k="0"]`,
   walks up via `offsetParent` to compute its position relative to the
   scroll container, and sets `scrollTop`. It retries via rAF until the
   element is laid out.

4. **k=0 alignment on swipe**: When the active weekday changes (swipe), the
   shared container scrolls to the new sheet's k=0. This keeps the current
   week aligned across sheets. The scroll position is not preserved across
   swipes — the current week is always brought to the top.

5. **Infinite scroll**: A single scroll listener on the shared container
   extends the window when near the top (`scrollTop < 800px`) or bottom
   (`scrollTop + clientHeight > scrollHeight - 800px`). On prepend, the
   visual position is preserved by recording `scrollHeight`, extending,
   then adjusting `scrollTop` by the height delta after render.

6. **Pre-rendered window**: Initial window is 8 weeks past + 8 weeks future
   (16 weeks per sheet, 112 date cards total). Extends by 8 in each direction.

### Why this works

The old fixed-canvas approach (30,000px div, absolute positioning, k=0 at
MIDDLE) failed on iOS Safari — the scroll container never became properly
scrollable, so init and infinite load never worked.

Normal flow is robust: the browser handles layout, and `offsetTop` gives
the true position. The trade-off is that k=0 is at different offsets in
each sheet (variable past heights), so we explicitly scroll to k=0 on
swipe instead of relying on a fixed coordinate.

### Data attributes

- `data-sheet-column="{weekday}"` — on each sheet's root div
- `data-sheet-k="{k}"` — on each date article (k = week offset from this week)
- `data-sheet-iso="{iso}"` — on each date article (for jump-to-date)
