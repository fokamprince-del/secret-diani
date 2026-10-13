import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL) ?? 'http://localhost:3000';
const mediaOrigin = origin(process.env.NEXT_PUBLIC_MEDIA_URL);
const analyticsOrigin = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  ? (origin(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC) ?? 'https://plausible.io')
  : null;
// Lecture vidéo des leçons (Bunny Stream, URL signées fournies par l'API).
const videoOrigins = ['https://*.b-cdn.net', 'https://*.mediadelivery.net'];

const sources = (...values: (string | null | false)[]) => values.filter(Boolean).join(' ');

/**
 * CSP stricte sans nonce : les pages publiques sont statiques (ISR), un nonce imposerait
 * un rendu dynamique. Les scripts Next sont vérifiés par intégrité (SRI, voir DECISIONS D-F05).
 */
const csp = [
  `default-src 'self'`,
  `script-src ${sources(`'self'`, isDev && `'unsafe-eval' 'unsafe-inline'`, analyticsOrigin)}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src ${sources(`'self'`, 'data:', 'blob:', apiOrigin, mediaOrigin)}`,
  `font-src 'self'`,
  `connect-src ${sources(`'self'`, apiOrigin, analyticsOrigin, ...videoOrigins, isDev && 'ws:')}`,
  `media-src ${sources(`'self'`, 'blob:', mediaOrigin, ...videoOrigins)}`,
  `worker-src 'self' blob:`,
  `frame-src 'none'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  !isDev && 'upgrade-insecure-requests',
]
  .filter(Boolean)
  .join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isDev
    ? []
    : [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ]),
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    sri: { algorithm: 'sha256' },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: mediaOrigin ? [new URL(`${mediaOrigin}/**`)] : [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
