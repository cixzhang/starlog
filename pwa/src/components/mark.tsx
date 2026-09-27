// The Starlog mark: a terminal-log line — a plump rounded sparkle
// followed by three log lines (≡). Cindy's sketch, cleaned up.
// Wide aspect (120x64); height derives from the `size` width.
// Theme-aware: coral lightens in night mode via --sl-coral.

export function StarlogMark({ size = 32 }: { size?: number }) {
  const h = (size * 64) / 120;
  const c = "var(--sl-coral)";
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 120 64"
      role="img"
      aria-label="Starlog logo"
    >
      {/* plump rounded sparkle: four round-capped arms */}
      <path
        d="M44,32 L44,12 M44,32 L64,32 M44,32 L44,52 M44,32 L24,32"
        fill="none"
        stroke={c}
        strokeWidth={13}
        strokeLinecap="round"
      />
      {/* log lines */}
      <g fill={c}>
        <rect x="78" y="20" width="22" height="6" rx="3"/><rect x="78" y="29" width="22" height="6" rx="3"/><rect x="78" y="38" width="22" height="6" rx="3"/>
      </g>
    </svg>
  );
}
