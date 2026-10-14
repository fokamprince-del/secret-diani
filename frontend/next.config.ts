import type { NextConfig } from 'next';
import { contentSecurityPolicy, mediaOrigin, PRIVATE_PATH_PREFIXES } from './lib/csp';

const isDev = process.env.NODE_ENV === 'development';

const privatePaths = PRIVATE_PATH_PREFIXES.map((prefix) => prefix.slice(1)).join('|');

const securityHeaders = [
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
    return [
      { source: '/:path*', headers: securityHeaders },
      // CSP statique partout sauf sur les pages privées, qui reçoivent la leur (à nonce) du proxy.
      {
        source: `/((?!${privatePaths}).*)`,
        headers: [{ key: 'Content-Security-Policy', value: contentSecurityPolicy() }],
      },
    ];
  },
};

export default nextConfig;
