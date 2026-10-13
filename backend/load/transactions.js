// Parcours transactionnels sous 50 requêtes/s, sans erreur (cahier des charges §7) :
//   - inscription (création de compte, e-mail mis en file) ;
//   - commande boutique (ajout au panier puis validation : commande « à payer » et stock
//     réservé dans une transaction ; le paiement chez Stripe n'est pas sollicité, voir README).
//   k6 run -e BASE_URL=… -e VARIANT_IDS=<id1,id2…> -e SHIPPING_RATE_ID=<id> load/transactions.js
import http from 'k6/http';
import { check, fail } from 'k6';
import { api, CAPTCHA_TOKEN, visitorHeaders } from './lib.js';

const ONLY = __ENV.ONLY; // « inscription » ou « commande » : un seul parcours

const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '2m';
// Une ou plusieurs variantes en stock (séparées par des virgules) : le trafic réel se répartit
// entre les kits ; une seule variante concentre tous les verrous de stock sur une ligne.
const VARIANT_IDS = (__ENV.VARIANT_IDS || __ENV.VARIANT_ID || '').split(',').filter(Boolean);
const SHIPPING_RATE_ID = __ENV.SHIPPING_RATE_ID;

export const options = {
  scenarios: Object.fromEntries(
    Object.entries({
      inscription: {
        executor: 'constant-arrival-rate',
        exec: 'register',
        rate: RATE,
        timeUnit: '1s',
        duration: DURATION,
        preAllocatedVUs: 50,
        maxVUs: 300,
      },
      commande: {
        executor: 'constant-arrival-rate',
        exec: 'order',
        rate: RATE,
        timeUnit: '1s',
        duration: DURATION,
        preAllocatedVUs: 50,
        maxVUs: 300,
      },
    }).filter(([name]) => !ONLY || name === ONLY),
  ),
  thresholds: {
    'http_req_failed{scenario:inscription}': ['rate==0'],
    'http_req_failed{scenario:commande}': ['rate==0'],
    'http_req_duration{scenario:inscription}': ['p(95)<1000'],
    'http_req_duration{scenario:commande}': ['p(95)<800'],
  },
};

export function setup() {
  if (VARIANT_IDS.length === 0 || !SHIPPING_RATE_ID) {
    fail(
      'VARIANT_IDS et SHIPPING_RATE_ID sont requis (variantes en stock, tarif de livraison actif).',
    );
  }
}

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${__VU}-${__ITER}@charge.example.com`;
}

export function register() {
  const res = http.post(
    `${api()}/auth/register`,
    JSON.stringify({
      email: uniqueEmail('inscription'),
      password: 'Charge-Ganache-Mangue-2026',
      acceptTerms: true,
    }),
    { headers: visitorHeaders(), tags: { name: 'inscription' } },
  );
  check(res, { 'inscription acceptée (202)': (r) => r.status === 202 });
}

export function order() {
  // Un visiteur = une IP et un panier invité. Le cookie de panier est « Secure » : k6 ne le
  // renverrait pas sur une URL http, il est donc recopié explicitement.
  const headers = visitorHeaders({ 'X-CSRF-Token': '1' });
  const base = api();
  const added = http.post(
    `${base}/shop/cart/items`,
    JSON.stringify({
      variantId: VARIANT_IDS[Math.floor(Math.random() * VARIANT_IDS.length)],
      quantity: 1,
    }),
    { headers, tags: { name: 'panier' } },
  );
  if (!check(added, { 'ajout au panier (200)': (r) => r.status === 200 })) return;
  const cart = added.cookies.diani_cart?.[0]?.value;
  if (!cart) return;
  const checkout = http.post(
    `${base}/shop/checkout`,
    JSON.stringify({
      email: uniqueEmail('commande'),
      firstName: 'Charge',
      lastName: 'Test',
      shippingRateId: SHIPPING_RATE_ID,
      shippingAddress: {
        firstName: 'Charge',
        lastName: 'Test',
        line1: '1 rue du Test',
        postalCode: '75011',
        city: 'Paris',
        country: 'FR',
      },
      acceptTerms: true,
      captchaToken: CAPTCHA_TOKEN,
    }),
    { headers: { ...headers, Cookie: `diani_cart=${cart}` }, tags: { name: 'validation' } },
  );
  check(checkout, { 'commande créée (201)': (r) => r.status === 201 });
}
