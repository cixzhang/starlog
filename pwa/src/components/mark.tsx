// The Starlog mark, derived from the plan's logo (logo/starlog-logo.svg).
// Do not redesign — this is the settled mark.

export function StarlogMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role="img"
      aria-label="Starlog logo"
    >
      <circle cx="120" cy="120" r="100" fill="var(--sl-paper-deep)" />
      <circle
        cx="120"
        cy="120"
        r="100"
        fill="none"
        stroke="var(--sl-ink)"
        strokeWidth="12"
      />
      <ellipse
        cx="120"
        cy="118"
        rx="84"
        ry="30"
        fill="none"
        stroke="var(--sl-gold)"
        strokeWidth="9"
        transform="rotate(-18 120 118)"
      />
      <path d="M58 148 L113 137 L113 173 L58 184 Z" fill="var(--sl-ink)" />
      <path d="M182 148 L127 137 L127 173 L182 184 Z" fill="var(--sl-ink)" />
      <rect x="117" y="136" width="6" height="40" fill="var(--sl-paper-deep)" />
      <path
        d="M120 46 C124 66 130 72 152 77 C130 82 124 88 120 106 C116 88 110 82 88 77 C110 72 116 66 120 46 Z"
        fill="var(--sl-coral)"
      />
      <path
        d="M180 48 C182 56 185 59 193 61 C185 63 182 66 180 74 C178 66 175 63 167 61 C175 59 178 56 180 48 Z"
        fill="var(--sl-gold)"
      />
    </svg>
  );
}
