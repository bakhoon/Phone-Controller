// Small inline stroke icons.

type P = { size?: number; color?: string };

const base = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
});

export const IconBack = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="M15 18l-6-6 6-6" /></svg>
);
export const IconGear = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconLayout = ({ size = 18, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><rect x="2" y="7" width="20" height="10" rx="2" /><path d="M18 12h.01" /></svg>
);
export const IconPad = ({ size = 26, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="M5 12h14M15 8l4 4-4 4M9 8l-4 4 4 4" /></svg>
);
export const IconArrows = ({ size = 26, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></svg>
);
export const IconStick = ({ size = 26, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></svg>
);
export const IconMouse = ({ size = 26, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}><rect x="6" y="3" width="12" height="18" rx="6" /><path d="M12 7v4" /></svg>
);
export const IconWarn = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)} style={{ flexShrink: 0 }}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);
export const IconController = ({ size = 20, color = 'currentColor' }: P) => (
  <svg {...base(size, color)}>
    <rect x="2" y="6" width="20" height="12" rx="4" />
    <path d="M7 10v4M5 12h4" />
    <circle cx="16" cy="11" r="1" />
    <circle cx="18" cy="13" r="1" />
  </svg>
);
