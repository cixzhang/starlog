// The Starlog mark, theme-aware:
// - light mode: pale dot — one coral dot in a light warm field
// - dark mode: pale dot — one coral dot in a navy field
// Favicon / PWA / share icons always use the crescent Earth (public/icons/).

const CORAL = "#F16E56";
const NAVY = "#193346";
const CREAM = "#F2EDE4";

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
        viewBox="0 0 96 96"
        role="img"
        aria-label="Starlog logo"
      >
        <rect width="96" height="96" rx="20" fill={CREAM} />
        <circle cx="48" cy="38" r="10" fill={CORAL} />
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
