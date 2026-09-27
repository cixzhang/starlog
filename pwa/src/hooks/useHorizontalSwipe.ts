import { useEffect, useRef } from 'react';

/**
 * Horizontal swipe detection that works reliably on iOS.
 *
 * Uses native non-passive touch listeners so that once a drag is clearly
 * horizontal we can preventDefault() the browser's scroll takeover.
 * React's synthetic onTouchMove is passive by default and cannot do this,
 * which is why iOS was cancelling our swipes mid-gesture.
 */
export function useHorizontalSwipe(
  ref: React.RefObject<HTMLElement | null>,
  onSwipe: (dir: 1 | -1) => void,
  threshold = 60,
) {
  const cb = useRef(onSwipe);
  cb.current = onSwipe;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX: number | null = null;
    let startY: number | null = null;
    let claimed = false;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      claimed = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startX == null || startY == null || claimed) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Once the drag is clearly horizontal, take over the gesture so
      // iOS doesn't scroll or fire touchcancel.
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        claimed = true;
        e.preventDefault();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (startX != null) {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > threshold) cb.current(dx < 0 ? 1 : -1);
      }
      startX = startY = null;
      claimed = false;
    };
    const onTouchCancel = () => {
      startX = startY = null;
      claimed = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [ref, threshold]);
}
