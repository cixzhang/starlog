# WeekdaySheet Scroll Specification

## Architecture: Fixed Canvas

Each weekday sheet uses a fixed 30,000px tall canvas with absolute positioning.
This is the "kept engine" — it must not be replaced with normal document flow.

### Invariants (must always hold)

1. **k=0 at MIDDLE**: The current week's date (k=0) is positioned at exactly
   `MIDDLE = 15000px` from the top of the inner canvas, in every sheet.
   - Past weeks (k<0) are positioned above with negative cumulative offsets.
   - Future weeks (k>0) are positioned below with positive cumulative offsets.

2. **Cross-sheet alignment**: Because k=0 is at the same coordinate (15000px)
   in all seven sheets, swiping between sheets preserves vertical position
   without adjustment. This is the reason for the fixed canvas — variable
   past-date heights must not affect k=0's position.

3. **Scrollable container**: The sheet's scroll container must be constrained
   to the viewport height (via `height: 100%` on the column and `flex: 1` on
   the scroll container). The 30,000px inner div must NOT stretch the container;
   it must be clipped by `overflow: hidden` on the column and scrolled via
   `overflow-y: auto` on the scroll container.

4. **Initial scroll position**: On mount, `container.scrollTop` must be set to
   `MIDDLE` (15000px), placing k=0 at the top of the visible viewport.
   - iOS Safari may not have laid out the 30,000px scrollable area when the
     layout effect first runs. The init must poll via `requestAnimationFrame`
     until `container.scrollHeight >= CONTAINER_HEIGHT`, then set scrollTop.
   - The init must not be marked complete until `scrollTop` actually sticks.

5. **Prepend stability**: When past weeks are prepended (infinite scroll up),
   k=0 must remain at MIDDLE. The layout effect recalculates all absolute
   positions on every render, so k=0 never shifts. No scrollTop adjustment
   is needed on prepend.

6. **Infinite scroll triggers**: Lazy loading must trigger off the RENDERED
   content edges (tracked via `contentTopRef`/`contentBottomRef`), not the
   30,000px container edges. Otherwise the user scrolls through ~14,000px
   of blank canvas before more dates load.

### Why not normal flow?

Normal document flow (pre-rendering N weeks in a vertical stack) cannot
guarantee cross-sheet alignment because past weeks have variable heights.
Sheet A might have 4000px of past content above k=0; Sheet B might have
4500px. Setting the same scrollTop on both would show different weeks.
The fixed canvas solves this by giving k=0 an absolute, stable coordinate.
