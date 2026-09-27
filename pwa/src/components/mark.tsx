// The Starlog orbit mark — the plan's primary mark (visual-brand sheet,
// section 07): coral journal core + navy orbit ring, tilted -18°.
// Geometrically simple so it holds at app-icon and inline sizes.
// Theme-aware: coral lightens in night mode via --sl-coral.

export function StarlogMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role="img"
      aria-label="Starlog logo"
    >
      {/* orbit, far half — passes behind the core */}
      <g
        transform="rotate(-18 120 120)"
        fill="none"
        stroke="var(--sl-navy)"
        strokeWidth="14"
        strokeLinecap="round"
      >
        <path d="M 16 120 A 104 38 0 0 1 224 120" />
      </g>
      {/* coral journal core */}
      <circle cx="120" cy="120" r="72" fill="var(--sl-coral)" />
      {/* orbit, near half — passes in front of the core */}
      <g
        transform="rotate(-18 120 120)"
        fill="none"
        stroke="var(--sl-navy)"
        strokeWidth="14"
        strokeLinecap="round"
      >
        <path d="M 16 120 A 104 38 0 0 0 224 120" />
      </g>
    </svg>
  );
}
