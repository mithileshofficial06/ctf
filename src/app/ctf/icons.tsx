/**
 * Inline SVG emblems for the Spider-Verse theme.
 *
 * All original, drawn with plain paths — NOTHING here reproduces Marvel/Sony
 * character art, which cannot ship in the app. These are the spider glyph, the
 * small UI icons, and the decorative city skyline. Where the mock showed a
 * character illustration, the markup leaves an `.bru-art-slot` the organiser can
 * drop a licensed image into; these emblems are what render until then.
 *
 * Every icon inherits `currentColor`, so colour comes from CSS.
 */

type IconProps = { className?: string; size?: number };

/** The spider glyph — body, head and eight legs. The theme's signature mark. */
export function Spider({ className, size = 24 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="12.5" rx="2.3" ry="3.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8.4" r="1.5" fill="currentColor" stroke="none" />
      {/* left legs */}
      <path d="M10 10.5 L5 7.5 L3.5 8.8" />
      <path d="M9.6 12 L4 11.4 L2.8 12.8" />
      <path d="M9.7 13.6 L4.4 15 L3.6 16.8" />
      <path d="M10.3 15 L6 17.6 L5.6 19.6" />
      {/* right legs */}
      <path d="M14 10.5 L19 7.5 L20.5 8.8" />
      <path d="M14.4 12 L20 11.4 L21.2 12.8" />
      <path d="M14.3 13.6 L19.6 15 L20.4 16.8" />
      <path d="M13.7 15 L18 17.6 L18.4 19.6" />
    </svg>
  );
}

export function Lock({ className, size = 16 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

/** Difficulty bars, rising left to right. */
export function Bars({ className, size = 16 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="3" y="14" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="12" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
    </svg>
  );
}

export function Download({ className, size = 18 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function ArrowLeft({ className, size = 18 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

export function Check({ className, size = 16 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 5 5 9-11" />
    </svg>
  );
}

/** The little "unsolved" bang the mock puts on each card. */
export function Bang({ className, size = 16 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2 1.5 21h21L12 2Zm-1.1 6h2.2l-.4 7h-1.4l-.4-7Zm1.1 9.2a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Z" />
    </svg>
  );
}

/** A hexagonal file badge for the attachment card. */
export function ZipFile({ className, size = 30 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M11 8.5h1.5M11 11h1.5M11 13.5h1.5" />
    </svg>
  );
}

/**
 * The city skyline strip that anchors the footer. Rendered as an <svg> so it
 * scales; the fill and glow come from CSS.
 */
export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 120 V70 h40 v-14 h26 v14 h20 V44 h30 v26 h34 V58 h24 v12 h30 V30 h20 v40 h28 V52 h34 v18 h22 V64 h40 v6 h26 V38 h24 v32 h30 V54 h30 v16 h26 V24 h22 v46 h34 V60 h28 v10 h30 V46 h24 v24 h34 V56 h26 v14 h30 V34 h22 v36 h30 V50 h34 v20 h24 V62 h30 v8 h28 V40 h24 v30 h34 V58 h26 v12 h30 V48 h22 v22 h34 V36 h28 v34 h30 V60 h30 v10 h26 V52 h24 v18 h30 V42 h22 v28 h40 V120 Z" />
    </svg>
  );
}
