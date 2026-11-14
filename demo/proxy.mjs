// Proxy de la démo : une seule origine publique (le tunnel Cloudflare) pour le site, l'API et
// les médias, comme le fera Traefik en production.
//   /api/v1/…  → API NestJS (127.0.0.1:3000)
//   /s3/…      → stockage S3 local (SeaweedFS, 127.0.0.1:8333), médias publics
//   le reste   → site Next.js (127.0.0.1:5173)
// Toute réponse porte « X-Robots-Tag: noindex » : la démo ne doit pas être référencée.
import http from 'node:http';

const PORT = Number(process.env.DEMO_PROXY_PORT ?? 8787);
const ROUTES = [
  { prefix: '/api/v1/', port: 3000, strip: '' },
  { prefix: '/s3/', port: 8333, strip: '/s3' },
];
const SITE_PORT = 5173;

function target(url) {
  for (const route of ROUTES) {
    if (url.startsWith(route.prefix)) {
      return { port: route.port, path: url.slice(route.strip.length) };
    }
  }
  return { port: SITE_PORT, path: url };
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' });
    res.end('User-agent: *\nDisallow: /\n');
    return;
  }
  const { port, path } = target(url);
  const forwardedFor = [req.headers['x-forwarded-for'], req.socket.remoteAddress]
    .filter(Boolean)
    .join(', ');
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port,
      path,
      method: req.method,
      headers: {
        ...req.headers,
        'x-forwarded-for': forwardedFor,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': req.headers.host ?? '',
      },
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, {
        ...response.headers,
        'x-robots-tag': 'noindex, nofollow',
      });
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Service momentanément indisponible (démo en cours de démarrage ?).');
  });
  req.pipe(upstream);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] http://127.0.0.1:${PORT} → site :${SITE_PORT}, API :3000, médias :8333`);
});
