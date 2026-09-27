// The Starlog mark, theme-aware:
// - light mode: earthrise — a small coral world over a navy limb
// - dark mode: pale dot — one warm dot in a navy field
// Favicon / PWA / share icons always use the crescent Earth (public/icons/).

const CORAL = "#F16E56";
const NAVY = "#193346";

export function StarlogMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="sl-mark"
      style={{ width: size, height: size, display: "inline-flex" }}
    >
      <svg
        className="sl-mark-light"
        width={size}
        height={size}
        viewBox="0 0 120 120"
        role="img"
        aria-label="Starlog logo"
      >
        <circle cx="60" cy="140" r="80" fill={NAVY} />
        <circle cx="60" cy="32" r="13" fill={CORAL} />
      </svg>
      <svg
        className="sl-mark-dark"
        width={size}
        height={size}
        viewBox="0 0 96 96"
        role="img"
        aria-label="Starlog logo"
      >
        <rect width="96" height="96" rx="20" fill={NAVY} />
        <circle cx="48" cy="38" r="10" fill={CORAL} />
      </svg>
    </span>
  );
}
