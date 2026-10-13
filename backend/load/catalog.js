// Lecture des catalogues publics : 300 requêtes/s, p95 < 300 ms (cahier des charges §7).
//   k6 run -e BASE_URL=https://staging-api.example.fr load/catalog.js
import http from 'k6/http';
import { check } from 'k6';
import { api, visitorHeaders } from './lib.js';

const RATE = Number(__ENV.RATE || 300);
const DURATION = __ENV.DURATION || '2m';

// Pages les plus vues, pondérées (accueil, traiteur, boutique, formations, blog).
const ROUTES = [
  ['/site/settings', 4],
  ['/catering/catalog', 3],
  ['/catering/conditions', 1],
  ['/shop/products', 3],
  ['/shop/kits/comparison', 1],
  ['/courses/packs', 2],
  ['/courses', 2],
  ['/content/articles', 2],
  ['/content/faq', 1],
  ['/content/reviews', 1],
];
const WEIGHTED = ROUTES.flatMap(([path, weight]) => Array(weight).fill(path));

export const options = {
  scenarios: {
    catalogue: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 100,
      maxVUs: 600,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const path = WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)];
  const res = http.get(`${api()}${path}`, { headers: visitorHeaders(), tags: { name: path } });
  check(res, { 'statut 200': (r) => r.status === 200 });
}
