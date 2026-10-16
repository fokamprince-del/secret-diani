import type { SVGProps } from 'react';

/**
 * Icônes au trait fin, d'une seule famille (24 × 24, trait 1,5, extrémités arrondies).
 * Décoratives par défaut (`aria-hidden`) : le libellé est porté par le bouton ou le lien.
 */
const paths = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5" />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8h13l-1 12h-11l-1-12z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </>
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.75" />
      <path d="M17.25 6.75v.01" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8L4 20z" />
      <path d="M9.2 8.6c.2-.5.6-.6.9-.6h.4c.2 0 .3.1.4.3l.7 1.6c.1.2 0 .4-.1.5l-.5.6c.6 1.2 1.6 2.2 2.8 2.8l.6-.5c.1-.1.3-.2.5-.1l1.6.7c.2.1.3.2.3.4v.4c0 .3-.1.7-.6.9-.6.3-1.5.4-2.6-.1a8.4 8.4 0 0 1-4.2-4.2c-.5-1.1-.4-2-.1-2.7z" />
    </>
  ),
  leaf: <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zm0 0l6-6" />,
  heart: (
    <path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z" />
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  chat: <path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-3 2.5z" />,
  home: <path d="M4 11l8-6.5 8 6.5M6 9.5V19.5h4.5v-5h3v5H18V9.5" />,
  pin: (
    <>
      <path d="M12 20.5s-6-5.3-6-10.2a6 6 0 0 1 12 0c0 4.9-6 10.2-6 10.2z" />
      <circle cx="12" cy="10.3" r="2.2" />
    </>
  ),
  shield: <path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.8-7 9-4-1.2-7-4.7-7-9V6.3z" />,
  logout: (
    <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14M10.5 12h9M16.5 8.5L20 12l-3.5 3.5" />
  ),
  download: <path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14" />,
  play: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.3 8.8v6.4l5-3.2z" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  star: <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" />,
  tiktok: (
    <path d="M14.5 4c.4 2.4 1.9 3.9 4.5 4.2v3a7.3 7.3 0 0 1-4.5-1.5v5.6a5.2 5.2 0 1 1-5.2-5.2h.7v3a2.2 2.2 0 1 0 1.5 2.1V4h3z" />
  ),
  facebook: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M15 8.5h-1.5a2 2 0 0 0-2 2V20.5M9.5 13h5" />
    </>
  ),
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <path d="M10.5 9.5v5l4-2.5z" />
    </>
  ),
  panier: <path d="M4 10h16l-1.6 9H5.6zM8.5 10l2-5M15.5 10l-2-5M9 14v2.5M12 14v2.5M15 14v2.5" />,
  couverts: (
    <path d="M7 3.5v6.5a2 2 0 0 0 2 2v8.5M9 3.5V8M11 3.5v6.5a2 2 0 0 1-2 2M17 20.5V3.5c-2.2 1.2-3 3.6-3 6.5 0 1.4.9 2.5 3 2.5" />
  ),
  ecran: <path d="M4.5 5.5h15v10h-15zM2.5 18.5h19M10.5 9l3.5 2-3.5 2z" />,
  accompagnement: (
    <path d="M12 20s-7-4.3-7-9.3A3.7 3.7 0 0 1 12 8.6a3.7 3.7 0 0 1 7 2.1c0 5-7 9.3-7 9.3zM9.5 12.5h5" />
  ),
} as const;

export type IconName = keyof typeof paths;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 22, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
