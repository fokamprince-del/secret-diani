/**
 * Boutique et paiements de l'API factice. Mêmes règles que le backend pour ce que voit le
 * frontend : panier invité dans un cookie HttpOnly (`/api/v1/shop`) ou panier du compte,
 * en-tête CSRF sur les modifications, prix et frais toujours calculés ici (jamais par le
 * navigateur), stock limité, paiement par redirection vers une page « hébergée ».
 *
 * La page de paiement factice (`/__mock/paiement`) propose « Payer » et « Annuler » ; « Payer »
 * marque la commande payée (le webhook du vrai backend) puis renvoie au site.
 */
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { components } from '../../lib/api/schema';
import { bearerEmail, bearerUserId } from './auth.mts';

type S = components['schemas'];
type Send = (
  res: ServerResponse,
  status: number,
  body?: unknown,
  headers?: Record<string, string | string[]>,
) => void;
type Fail = (
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  errors?: unknown,
) => void;

const CART_COOKIE = 'diani_cart';
const MAX_PER_ITEM = 5;
const LOW_STOCK = 3;

type Variant = S['ShopVariantDto'] & {
  stock: number;
  productSlug: string;
  weightGrams: number;
};

function availability(stock: number): S['AvailabilityDto'] {
  if (stock <= 0) return { status: 'out_of_stock', remaining: null };
  if (stock <= LOW_STOCK) return { status: 'low_stock', remaining: stock };
  return { status: 'in_stock', remaining: null };
}

type ProductSeed = {
  slug: string;
  name: string;
  kind: 'kit' | 'accessory';
  shortDescription: string;
  variants: { label: string; priceCents: number; stock: number }[];
  composition?: [string, number, string?][];
};

const SEEDS: ProductSeed[] = [
  {
    slug: 'kit-debutant',
    name: 'Kit Débutant',
    kind: 'kit',
    shortDescription: 'L’essentiel pour réussir ses premiers layer cakes.',
    variants: [{ label: 'Standard', priceCents: 3_799, stock: 20 }],
    composition: [
      ['Poches à douille jetables', 10],
      ['Douilles inox', 3, 'ronde, étoile, pétale'],
      ['Spatule coudée', 1],
    ],
  },
  {
    slug: 'kit-expert',
    name: 'Kit Expert',
    kind: 'kit',
    shortDescription: 'Pour lisser, décorer et monter des gâteaux à étages.',
    variants: [{ label: 'Standard', priceCents: 5_999, stock: 2 }],
    composition: [
      ['Poches à douille jetables', 20],
      ['Douilles inox', 6],
      ['Spatule coudée', 1],
      ['Racloir lisse', 1],
      ['Plateau tournant', 1],
    ],
  },
  {
    slug: 'kit-pro-atelier',
    name: 'Kit Pro Atelier',
    kind: 'kit',
    shortDescription: 'L’équipement complet de l’atelier, comme chez Diani.',
    variants: [{ label: 'Standard', priceCents: 8_999, stock: 0 }],
    composition: [
      ['Poches à douille jetables', 30],
      ['Douilles inox', 12],
      ['Spatule coudée', 2],
      ['Racloir lisse', 1],
      ['Plateau tournant', 1],
      ['Cercles à pâtisserie', 3],
    ],
  },
  {
    slug: 'poche-a-douille-reutilisable',
    name: 'Poche à douille réutilisable',
    kind: 'accessory',
    shortDescription: 'Silicone, lavable, trois tailles.',
    variants: [
      { label: '30 cm', priceCents: 690, stock: 50 },
      { label: '40 cm', priceCents: 790, stock: 50 },
    ],
  },
];

let variantSeq = 0;
const variants: Variant[] = [];
const products = SEEDS.map((seed, index) => {
  const productVariants = seed.variants.map((variant) => {
    const entry: Variant = {
      id: `sv${++variantSeq}`,
      sku: `${seed.slug.toUpperCase()}-${variantSeq}`,
      label: variant.label,
      priceCents: variant.priceCents,
      availability: availability(variant.stock),
      stock: variant.stock,
      productSlug: seed.slug,
      weightGrams: 800,
    };
    variants.push(entry);
    return entry;
  });
  return { seed, id: `sp${index + 1}`, variants: productVariants };
});

function best(productVariants: Variant[]): S['AvailabilityDto'] {
  const stock = Math.max(...productVariants.map((variant) => variant.stock));
  return availability(stock);
}

function card(product: (typeof products)[number]): S['ShopProductCardDto'] {
  return {
    id: product.id,
    slug: product.seed.slug,
    name: product.seed.name,
    kind: product.seed.kind,
    shortDescription: product.seed.shortDescription,
    fromPriceCents: Math.min(...product.variants.map((variant) => variant.priceCents)),
    image: null,
    availability: best(product.variants),
  };
}

const publicVariant = ({ id, sku, label, priceCents, stock }: Variant): S['ShopVariantDto'] => ({
  id,
  sku,
  label,
  priceCents,
  availability: availability(stock),
});

function detail(product: (typeof products)[number]): S['ShopProductDetailDto'] {
  return {
    ...card(product),
    descriptionHtml: `<p>${product.seed.shortDescription} Description de démonstration.</p>`,
    variants: product.variants.map(publicVariant),
    composition: (product.seed.composition ?? []).map(([label, quantity, details]) => ({
      label,
      quantity,
      details: details ?? null,
    })),
    gallery: [],
    seo: {
      title: product.seed.name,
      description: product.seed.shortDescription,
      canonicalUrl: `http://localhost:5173/boutique/${product.seed.slug}`,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.seed.name,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: (card(product).fromPriceCents / 100).toFixed(2),
      },
    },
  };
}

export const shopProducts = () => products.map(card);

function comparison(): S['KitComparisonDto'] {
  const kits = products.filter((product) => product.seed.kind === 'kit');
  const labels = [
    ...new Set(kits.flatMap((kit) => (kit.seed.composition ?? []).map(([label]) => label))),
  ];
  return {
    kits: kits.map((kit) => ({
      slug: kit.seed.slug,
      name: kit.seed.name,
      fromPriceCents: card(kit).fromPriceCents,
    })),
    rows: labels.map((label) => ({
      label,
      values: kits.map(
        (kit) => kit.seed.composition?.find(([entry]) => entry === label)?.[1] ?? null,
      ),
    })),
  };
}

// ---------- Panier ----------

const carts = new Map<string, Map<string, number>>();

function cookieValue(req: IncomingMessage): string | undefined {
  return (req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === CART_COOKIE)?.[1];
}

/** Panier du compte (connectée) ou du cookie invité ; crée le cookie si besoin. */
function cartFor(req: IncomingMessage, create: boolean): { key: string | null; cookie?: string } {
  const userId = bearerUserId(req);
  if (userId) return { key: `user:${userId}` };
  const token = cookieValue(req);
  if (token && carts.has(`guest:${token}`)) return { key: `guest:${token}` };
  if (!create) return { key: null };
  const fresh = randomUUID().replace(/-/g, '');
  carts.set(`guest:${fresh}`, new Map());
  return {
    key: `guest:${fresh}`,
    cookie: `${CART_COOKIE}=${fresh}; Path=/api/v1/shop; HttpOnly; SameSite=Strict; Max-Age=2592000`,
  };
}

const SHIPPING: Record<string, S['ShippingOptionDto'][]> = {
  FR: [
    {
      id: 'ship-colissimo',
      name: 'Colissimo',
      method: 'delivery',
      priceCents: 690,
      delay: '2 à 4 jours ouvrés',
      free: false,
    },
    {
      id: 'ship-retrait',
      name: 'Retrait à l’atelier',
      method: 'pickup',
      priceCents: 0,
      delay: null,
      free: false,
    },
  ],
  BE: [
    {
      id: 'ship-europe',
      name: 'Colissimo Europe',
      method: 'delivery',
      priceCents: 1_290,
      delay: '4 à 7 jours ouvrés',
      free: false,
    },
  ],
};

function cartView(key: string | null, country: string): S['CartDto'] {
  const lines = key ? (carts.get(key) ?? new Map<string, number>()) : new Map<string, number>();
  const items: S['CartLineDto'][] = [...lines.entries()].map(([variantId, quantity]) => {
    const variant = variants.find((entry) => entry.id === variantId)!;
    const product = products.find((entry) => entry.seed.slug === variant.productSlug)!;
    const maxQuantity = Math.min(MAX_PER_ITEM, variant.stock);
    return {
      variantId,
      productSlug: product.seed.slug,
      productName: product.seed.name,
      variantLabel: variant.label,
      image: null,
      unitPriceCents: variant.priceCents,
      quantity,
      lineTotalCents: variant.priceCents * quantity,
      availability: availability(variant.stock),
      maxQuantity,
      issue:
        variant.stock <= 0 ? 'unavailable' : quantity > variant.stock ? 'insufficient_stock' : null,
    };
  });
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const options = (SHIPPING[country] ?? []).map((option) =>
    option.method === 'delivery' && subtotalCents >= 10_000
      ? { ...option, priceCents: 0, free: true }
      : option,
  );
  return {
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalCents,
    weightGrams: items.length * 800,
    shippingOptions: items.length > 0 ? options : [],
    pickupDetails:
      country === 'FR' ? 'Atelier de Diani, Créteil — sur rendez-vous, du mardi au samedi.' : null,
    checkoutReady: items.length > 0 && items.every((item) => item.issue === null),
  };
}

// ---------- Commandes ----------

interface Order {
  view: S['OrderDto'];
  token: string;
  userId: string | null;
  email: string;
  /** Panier vidé une fois la commande payée (comme le backend). */
  cartKey: string | null;
}
const orders = new Map<string, Order>();
let orderSeq = 41;

const STATUS_LABELS: Record<S['OrderDto']['status'], string> = {
  pending_payment: 'En attente de paiement',
  paid: 'Payée',
  preparing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
};

function setStatus(order: Order, status: S['OrderDto']['status']) {
  order.view.timeline.push({
    fromStatus: order.view.status,
    toStatus: status,
    note: null,
    createdAt: new Date().toISOString(),
  });
  order.view.status = status;
  order.view.statusLabel = STATUS_LABELS[status];
  if (status === 'paid') {
    if (order.cartKey) carts.delete(order.cartKey);
    order.view.paidAt = new Date().toISOString();
    order.view.invoiceAvailable = true;
    order.view.reservationExpiresAt = null;
  }
}

const orderByToken = (token: string) => [...orders.values()].find((order) => order.token === token);
const summary = ({ view }: Order): S['OrderSummaryDto'] => ({
  id: view.id,
  reference: view.reference,
  status: view.status,
  statusLabel: view.statusLabel,
  totalCents: view.totalCents,
  itemCount: view.itemCount,
  createdAt: view.createdAt,
});

const csrfMissing = (req: IncomingMessage) => !req.headers['x-csrf-token'];

export async function handleShop(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  path: string,
  body: Record<string, unknown>,
  send: Send,
  fail: Fail,
  siteUrl: string,
): Promise<boolean> {
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/shop/products') {
    const kind = url.searchParams.get('kind');
    send(
      res,
      200,
      shopProducts().filter((product) => !kind || product.kind === kind),
    );
    return true;
  }
  const productMatch = /^\/shop\/products\/([a-z0-9-]+)$/.exec(path);
  if (method === 'GET' && productMatch) {
    const product = products.find((entry) => entry.seed.slug === productMatch[1]);
    if (product) send(res, 200, detail(product));
    else fail(res, 404, 'NOT_FOUND', 'Ce produit est introuvable.');
    return true;
  }
  if (method === 'GET' && path === '/shop/kits/comparison') {
    send(res, 200, comparison());
    return true;
  }
  if (method === 'GET' && path === '/payments/methods') {
    send(res, 200, { stripe: true, paypal: true });
    return true;
  }

  const country = url.searchParams.get('country') ?? 'FR';
  if (path.startsWith('/shop/cart')) {
    if (method !== 'GET' && csrfMissing(req)) {
      fail(
        res,
        403,
        'CSRF_REJECTED',
        'Requête refusée pour des raisons de sécurité. Merci de recharger la page.',
      );
      return true;
    }
    if (method === 'GET' && path === '/shop/cart') {
      send(res, 200, cartView(cartFor(req, false).key, country));
      return true;
    }
    if (method === 'POST' && path === '/shop/cart/merge') {
      const userId = bearerUserId(req);
      const token = cookieValue(req);
      if (userId && token && carts.has(`guest:${token}`)) {
        const target = carts.get(`user:${userId}`) ?? new Map<string, number>();
        for (const [variantId, quantity] of carts.get(`guest:${token}`)!) {
          target.set(variantId, Math.min(MAX_PER_ITEM, (target.get(variantId) ?? 0) + quantity));
        }
        carts.set(`user:${userId}`, target);
        carts.delete(`guest:${token}`);
      }
      send(res, 200, cartView(userId ? `user:${userId}` : null, country), {
        'Set-Cookie': `${CART_COOKIE}=; Path=/api/v1/shop; HttpOnly; SameSite=Strict; Max-Age=0`,
      });
      return true;
    }
    const { key, cookie } = cartFor(req, true);
    const lines = carts.get(key!) ?? new Map<string, number>();
    carts.set(key!, lines);
    const headers: Record<string, string> = cookie ? { 'Set-Cookie': cookie } : {};
    if (method === 'POST' && path === '/shop/cart/items') {
      const variant = variants.find((entry) => entry.id === body.variantId);
      if (!variant) {
        fail(res, 404, 'NOT_FOUND', 'Ce produit est introuvable.');
        return true;
      }
      const wanted = (lines.get(variant.id) ?? 0) + Number(body.quantity ?? 1);
      if (variant.stock <= 0 || wanted > Math.min(MAX_PER_ITEM, variant.stock)) {
        fail(
          res,
          409,
          'INSUFFICIENT_STOCK',
          variant.stock <= 0
            ? 'Ce produit est en rupture de stock.'
            : `Quantité maximale atteinte pour ce produit (${Math.min(MAX_PER_ITEM, variant.stock)}).`,
        );
        return true;
      }
      lines.set(variant.id, wanted);
      send(res, 200, cartView(key, country), headers);
      return true;
    }
    const itemMatch = /^\/shop\/cart\/items\/([\w-]+)$/.exec(path);
    if (itemMatch) {
      const variantId = itemMatch[1]!;
      if (method === 'DELETE' || Number(body.quantity) === 0) lines.delete(variantId);
      else lines.set(variantId, Math.max(1, Math.min(MAX_PER_ITEM, Number(body.quantity))));
      send(res, 200, cartView(key, country), headers);
      return true;
    }
  }

  if (method === 'POST' && path === '/shop/checkout') {
    if (csrfMissing(req)) {
      fail(
        res,
        403,
        'CSRF_REJECTED',
        'Requête refusée pour des raisons de sécurité. Merci de recharger la page.',
      );
      return true;
    }
    const { key } = cartFor(req, false);
    const shippingCountry =
      (body.shippingAddress as { country?: string } | undefined)?.country ?? 'FR';
    const cart = cartView(key, shippingCountry);
    const option = cart.shippingOptions.find((entry) => entry.id === body.shippingRateId);
    const email = bearerEmail(req) ?? String(body.email ?? '');
    const errors: { field: string; messages: string[] }[] = [];
    if (!body.acceptTerms) errors.push({ field: 'acceptTerms', messages: ['doit être accepté'] });
    if (!email.includes('@'))
      errors.push({ field: 'email', messages: ['doit être une adresse e-mail valide'] });
    if (!option)
      errors.push({ field: 'shippingRateId', messages: ['option de livraison inconnue'] });
    if (option?.method === 'delivery' && !body.shippingAddress) {
      errors.push({ field: 'shippingAddress', messages: ['obligatoire pour une livraison'] });
    }
    if (errors.length > 0) {
      fail(res, 400, 'VALIDATION_ERROR', 'Les données envoyées sont invalides.', errors);
      return true;
    }
    if (!cart.checkoutReady) {
      fail(res, 409, 'CART_CHANGED', 'Votre panier a changé : vérifiez-le avant de commander.');
      return true;
    }
    const id = randomUUID();
    const token = `suivi${randomUUID().replace(/-/g, '')}`;
    const shippingCents = option!.priceCents;
    const view: S['OrderDto'] = {
      id,
      reference: `CMD-${String(++orderSeq).padStart(6, '0')}`,
      status: 'pending_payment',
      statusLabel: STATUS_LABELS.pending_payment,
      totalCents: cart.subtotalCents + shippingCents,
      itemCount: cart.itemCount,
      createdAt: new Date().toISOString(),
      items: cart.items.map((item) => ({
        productName: item.productName,
        variantLabel: item.variantLabel,
        sku: null,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
      })),
      subtotalCents: cart.subtotalCents,
      shippingCents,
      refundedCents: 0,
      shippingMethod: option!.method,
      shippingRateName: option!.name,
      shippingAddress: (body.shippingAddress as S['OrderAddressDto']) ?? null,
      carrier: null,
      trackingNumber: null,
      reservationExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      paidAt: null,
      shippedAt: null,
      deliveredAt: null,
      invoiceAvailable: false,
      timeline: [
        {
          fromStatus: null,
          toStatus: 'pending_payment',
          note: null,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    orders.set(id, { view, token, userId: bearerUserId(req), email, cartKey: key });
    send(res, 201, {
      orderId: id,
      reference: view.reference,
      totalCents: view.totalCents,
      reservationExpiresAt: view.reservationExpiresAt!,
      trackingToken: token,
    } satisfies S['CheckoutResultDto']);
    return true;
  }

  if (method === 'POST' && path === '/payments/checkout') {
    const order = orderByToken(String(body.token ?? ''));
    if (!order || order.view.status !== 'pending_payment') {
      fail(res, 409, 'PAYMENT_NOT_ALLOWED', 'Cette commande ne peut plus être payée.');
      return true;
    }
    const provider = body.provider === 'paypal' ? 'paypal' : 'stripe';
    const page = new URL('/__mock/paiement', `http://localhost:${url.port}`);
    page.searchParams.set('suivi', order.token);
    page.searchParams.set('moyen', provider);
    send(res, 201, {
      paymentId: randomUUID(),
      provider,
      redirectUrl: page.toString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    } satisfies S['StartedPaymentDto']);
    return true;
  }
  if (method === 'POST' && path === '/payments/paypal/capture') {
    const order = orderByToken(String(body.token ?? ''));
    if (!order) {
      fail(res, 404, 'NOT_FOUND', 'Commande introuvable.');
      return true;
    }
    const outcome = order.view.status === 'pending_payment' ? 'paid' : 'already_processed';
    if (outcome === 'paid') setStatus(order, 'paid');
    send(res, 200, { outcome, order: order.view } satisfies S['PaymentResultDto']);
    return true;
  }

  if (method === 'GET' && path === '/shop/orders/track') {
    const order = orderByToken(url.searchParams.get('token') ?? '');
    if (order) send(res, 200, order.view);
    else fail(res, 404, 'NOT_FOUND', 'Ce lien de suivi n’est pas valide.');
    return true;
  }
  if (method === 'GET' && path === '/shop/orders/track/invoice') {
    const order = orderByToken(url.searchParams.get('token') ?? '');
    if (!order?.view.invoiceAvailable)
      fail(res, 409, 'INVOICE_NOT_READY', 'La facture est en préparation.');
    else send(res, 200, { url: `${siteUrl}/facture-demo.pdf` });
    return true;
  }

  if (path.startsWith('/me/orders')) {
    const userId = bearerUserId(req);
    if (!userId) {
      fail(res, 401, 'UNAUTHORIZED', 'Votre session a expiré. Reconnectez-vous pour continuer.');
      return true;
    }
    const mine = [...orders.values()].filter((order) => order.userId === userId);
    if (path === '/me/orders') {
      send(res, 200, {
        items: mine.map(summary).reverse(),
        nextCursor: null,
      } satisfies S['OrderListDto']);
      return true;
    }
    const match = /^\/me\/orders\/([\w-]+)(\/invoice)?$/.exec(path);
    const order = mine.find((entry) => entry.view.id === match?.[1]);
    if (!order) fail(res, 404, 'NOT_FOUND', 'Commande introuvable.');
    else if (match?.[2]) {
      if (order.view.invoiceAvailable) send(res, 200, { url: `${siteUrl}/facture-demo.pdf` });
      else fail(res, 409, 'INVOICE_NOT_READY', 'La facture est en préparation.');
    } else send(res, 200, order.view);
    return true;
  }
  return false;
}

/** Page de paiement « hébergée » factice : Payer (paiement confirmé) ou Annuler. */
export function paymentPage(url: URL, res: ServerResponse, siteUrl: string) {
  const token = url.searchParams.get('suivi') ?? '';
  const provider = url.searchParams.get('moyen') ?? 'stripe';
  const order = orderByToken(token);
  if (url.searchParams.get('action') === 'payer' && order) {
    // Stripe : le webhook confirme la commande ; PayPal : le site capture au retour.
    if (provider === 'stripe' && order.view.status === 'pending_payment') setStatus(order, 'paid');
    res.writeHead(302, { Location: `${siteUrl}/commande/succes?suivi=${token}&moyen=${provider}` });
    res.end();
    return;
  }
  if (url.searchParams.get('action') === 'annuler') {
    res.writeHead(302, { Location: `${siteUrl}/commande/annule?suivi=${token}` });
    res.end();
    return;
  }
  const base = `/__mock/paiement?suivi=${encodeURIComponent(token)}&moyen=${provider}`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><html lang="fr"><title>Paiement factice</title><body><h1>Paiement factice (${provider})</h1>` +
      `<p>Commande ${order?.view.reference ?? 'inconnue'} : ${order ? (order.view.totalCents / 100).toFixed(2) : '?'} €</p>` +
      `<a href="${base}&action=payer">Payer</a> <a href="${base}&action=annuler">Annuler</a></body></html>`,
  );
}
