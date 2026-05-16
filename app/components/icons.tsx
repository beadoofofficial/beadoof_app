type IconProps = { className?: string };

const baseSvgProps = {
  fill: "none",
  stroke: "currentColor" as const,
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export function IconHeart({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg {...baseSvgProps} className={className}>
      <path d="M20.8 6.6a5 5 0 0 0-7.1 0L12 8.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
    </svg>
  );
}

export function IconRefresh({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg {...baseSvgProps} className={className}>
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function IconZoomIn({ className = "w-4 h-4" }: IconProps) {
  return (
    <svg {...baseSvgProps} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 8v6M8 11h6" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function IconBox({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg {...baseSvgProps} className={className}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function IconX({ className = "w-3 h-3" }: IconProps) {
  return (
    <svg {...baseSvgProps} className={className} strokeWidth={2.5}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}