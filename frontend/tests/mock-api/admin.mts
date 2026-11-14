/**
 * Back-office de l'API factice : de quoi parcourir et tester les écrans principaux
 * (tableau de bord, demandes traiteur, carte, paramètres). Les autres listes répondent vides.
 * Comme le vrai backend : 401 sans jeton, 403 pour un compte client.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { components } from '../../lib/api/schema';
import { bearerRole } from './auth.mts';
import { cateringCatalog } from './fixtures.mts';

type S = components['schemas'];
type Request = S['AdminCateringRequestDto'];
type Send = (res: ServerResponse, status: number, body?: unknown) => void;
type Fail = (res: ServerResponse, status: number, code: string, message: string) => void;

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const NEXT: Record<Request['status'], Request['nextStatuses']> = {
  new: ['contacted', 'deposit_received', 'cancelled'],
  contacted: ['deposit_received', 'cancelled'],
  deposit_received: ['confirmed', 'cancelled'],
  confirmed: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

function initialRequests(): Request[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'req-1',
      reference: 'TR-000042',
      source: 'form',
      status: 'new',
      firstName: 'Awa',
      lastName: 'Diallo',
      eventDate: inDays(9),
      guestCount: 60,
      occasion: 'wedding',
      estimatedTotalCents: 24_000,
      agreedTotalCents: null,
      createdAt: now,
      email: 'awa@exemple.fr',
      phone: '+33612345678',
      fulfilment: 'delivery',
      deliveryAddress: 'Créteil',
      message: 'Buffet salé pour le vin d’honneur, et un layer cake vanille-fraise.',
      depositCents: 2_000,
      balanceCents: null,
      depositReceivedAt: null,
      depositMethod: null,
      confirmedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      internalNotes: null,
      slot: null,
      items: [
        {
          productName: 'Plateau découverte',
          variantLabel: '20 pièces',
          unitPriceCents: 4_000,
          quantity: 6,
          flavours: [],
        },
      ],
      events: [{ fromStatus: null, toStatus: 'new', actorId: null, note: null, createdAt: now }],
      nextStatuses: NEXT.new,
      customerWhatsappUrl: 'https://wa.me/33612345678',
    },
  ];
}

let requests = initialRequests();

/** Remise à zéro entre deux tests (appelée par `/__mock/admin/reset`). */
export function resetAdmin() {
  requests = initialRequests();
}

function changeStatus(request: Request, to: Request['status'], note: string | null) {
  request.events.push({
    fromStatus: request.status,
    toStatus: to,
    actorId: 'admin',
    note,
    createdAt: new Date().toISOString(),
  });
  request.status = to;
  request.nextStatuses = NEXT[to];
}

const categories: S['AdminCateringCategoryDto'][] = cateringCatalog.categories.map(
  (category, index) => ({
    id: `cat-${category.slug}`,
    slug: category.slug,
    name: category.name,
    description: category.description,
    kind: category.kind,
    position: index,
    visible: true,
    productCount: category.products.length,
  }),
);

const products: S['AdminCateringProductDto'][] = cateringCatalog.categories.flatMap((category) =>
  category.products.map((product, index) => ({
    id: product.id,
    categoryId: `cat-${category.slug}`,
    slug: product.slug,
    name: product.name,
    description: product.description,
    composition: product.composition,
    variants: product.variants,
    maxFlavours: product.maxFlavours,
    flavours: product.flavours,
    allergens: product.allergens,
    images: [],
    position: index,
    visible: true,
    seoTitle: null,
    seoDescription: null,
    updatedAt: new Date().toISOString(),
  })),
);

const flavours: S['AdminFlavourDto'][] = (
  cateringCatalog.categories.flatMap((category) => category.products).find((p) => p.flavours.length)
    ?.flavours ?? []
).map((flavour, position) => ({ ...flavour, position, visible: true }));

const settingsList: S['SettingDto'][] = [
  {
    key: 'site.whatsapp_number',
    group: 'site',
    groupLabel: 'Site',
    description: 'Numéro WhatsApp affiché sur le site',
    value: '+33600000000' as never,
    defaultValue: '' as never,
    isDefault: false,
    schema: { type: 'string' } as never,
    updatedAt: new Date().toISOString(),
  },
  {
    key: 'catering.deposit_below_cents',
    group: 'catering',
    groupLabel: 'Traiteur',
    description: 'Acompte sous le seuil',
    value: 1_000 as never,
    defaultValue: 1_000 as never,
    isDefault: true,
    schema: { type: 'integer' } as never,
    updatedAt: null,
  },
];

/** Listes renvoyées en tableau par le vrai backend (les autres sont paginées). */
const ARRAY_LISTS =
  /^\/admin\/(pages|faq|reviews|catering\/slots|shop\/(products|stock|shipping-rates)|courses(\/(packs|accesses|stats|call-requests))?|article-categories)$/;

function dashboard(): S['DashboardDto'] {
  const daily = Array.from({ length: 30 }, (_, index) => ({
    day: inDays(index - 29),
    orders: index % 4,
    grossCents: (index % 4) * 3_799 + (index % 7 === 0 ? 8_999 : 0),
  }));
  return {
    period: { days: 30, from: inDays(-29), to: inDays(0) },
    sales: {
      orders: 42,
      grossCents: 168_000,
      refundedCents: 3_799,
      netCents: 164_201,
      shop: { orders: 30, grossCents: 120_000 },
      courses: { orders: 12, grossCents: 48_000 },
      daily,
    },
    todo: {
      ordersToShip: 3,
      cateringPending: requests.filter((request) => request.status === 'new').length,
      cateringUpcoming: 1,
      contactMessagesNew: 2,
      callRequestsPending: 1,
    },
    customers: { newAccounts: 8, verifiedNewAccounts: 7, totalActive: 120 },
    courses: { newAccesses: 12, activeAccesses: 64 },
    newsletter: { confirmed: 210, newConfirmed: 14 },
    lowStock: [
      {
        variantId: 'v-kit',
        productName: 'Kit Débutant',
        label: 'Standard',
        sku: 'KIT-DEBUTANT',
        available: 2,
        threshold: 5,
      },
    ],
  };
}

export async function handleAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  body: Record<string, unknown>,
  send: Send,
  error: Fail,
): Promise<boolean> {
  if (!path.startsWith('/admin')) return false;
  const role = bearerRole(req);
  if (!role) {
    error(res, 401, 'UNAUTHORIZED', 'Votre session a expiré. Reconnectez-vous pour continuer.');
    return true;
  }
  if (role !== 'admin') {
    error(res, 403, 'FORBIDDEN', 'Accès réservé à l’administration.');
    return true;
  }
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/admin/dashboard') {
    send(res, 200, dashboard());
    return true;
  }
  if (method === 'GET' && path === '/admin/catering-requests') {
    send(res, 200, { items: requests, nextCursor: null });
    return true;
  }

  const requestMatch = /^\/admin\/catering-requests\/([^/]+)(?:\/(status|deposit|recap))?$/.exec(
    path,
  );
  if (requestMatch) {
    const request = requests.find((item) => item.id === requestMatch[1]);
    if (!request) {
      error(res, 404, 'NOT_FOUND', 'Demande introuvable.');
      return true;
    }
    const action = requestMatch[2];
    if (action === 'recap') {
      send(res, 200, { text: `Commande ${request.reference} — ${request.firstName}` });
      return true;
    }
    if (!action && method === 'PATCH') Object.assign(request, body);
    if (action === 'status') {
      changeStatus(request, body.status as Request['status'], (body.note as string) ?? null);
    }
    if (action === 'deposit') {
      request.agreedTotalCents = (body.agreedTotalCents as number) ?? request.agreedTotalCents;
      request.depositReceivedAt = new Date().toISOString();
      request.depositMethod = String(body.method);
      request.balanceCents = (request.agreedTotalCents ?? 0) - (request.depositCents ?? 0);
      changeStatus(request, 'deposit_received', null);
    }
    send(res, 200, request);
    return true;
  }

  if (method === 'GET' && path === '/admin/catering/categories') {
    send(res, 200, categories);
    return true;
  }
  if (method === 'GET' && path === '/admin/catering/flavours') {
    send(res, 200, flavours);
    return true;
  }
  if (method === 'GET' && path === '/admin/catering/products') {
    send(res, 200, products);
    return true;
  }
  const productMatch = /^\/admin\/catering\/products\/([^/]+)$/.exec(path);
  if (productMatch) {
    const product = products.find((item) => item.id === productMatch[1]);
    if (!product) {
      error(res, 404, 'NOT_FOUND', 'Produit introuvable.');
      return true;
    }
    if (method === 'PATCH') {
      const { flavourIds: _flavourIds, images: _images, variants, ...rest } = body;
      Object.assign(product, rest, { updatedAt: new Date().toISOString() });
      if (Array.isArray(variants)) {
        product.variants = (variants as (S['VariantInputDto'] & { id?: string })[]).map(
          (variant, index) => ({
            id: variant.id ?? `nv-${index}`,
            label: variant.label,
            priceCents: variant.priceCents,
            servingsMin: variant.servingsMin ?? null,
            servingsMax: variant.servingsMax ?? null,
          }),
        );
      }
    }
    send(res, 200, product);
    return true;
  }

  if (method === 'GET' && path === '/admin/settings') {
    send(res, 200, settingsList);
    return true;
  }
  const settingMatch = /^\/admin\/settings\/(.+)$/.exec(path);
  if (settingMatch && method === 'PUT') {
    const setting = settingsList.find((item) => item.key === settingMatch[1]);
    if (setting) {
      Object.assign(setting, {
        value: body.value,
        isDefault: false,
        updatedAt: new Date().toISOString(),
      });
    }
    send(res, 200, setting);
    return true;
  }

  if (method === 'GET') {
    send(res, 200, ARRAY_LISTS.test(path) ? [] : { items: [], nextCursor: null });
    return true;
  }
  error(res, 404, 'NOT_FOUND', 'Route d’administration absente de l’API factice.');
  return true;
}
