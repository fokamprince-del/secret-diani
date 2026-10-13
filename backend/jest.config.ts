import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: String.raw`\.spec\.ts$`,
  // Paquets publiés uniquement en ESM (dépendances de sanitize-html) : transpilés pour Jest
  // (Node 24 les charge nativement en production).
  transform: {
    [String.raw`^.+\.[tj]s$`]: ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.jest.json' }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(htmlparser2|domhandler|domutils|dom-serializer|entities|domelementtype)/)',
  ],
  testEnvironment: 'node',
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.module.ts',
    '!main.ts',
    '!worker.ts',
    '!worker-healthcheck.ts',
    '!instrument.ts',
    // Code d'assemblage couvert par les tests e2e (application réelle, base et Redis réels).
    '!bootstrap.ts',
    '!swagger.ts',
    '!**/*.controller.ts',
    '!prisma/prisma.service.ts',
    '!common/throttler/redis-throttler.storage.ts',
    '!common/errors/error-response.ts',
    // Services adossés à Postgres/Redis : couverts par les tests e2e (seuils dans test/jest-e2e.config.ts).
    '!auth/auth.service.ts',
    '!auth/login-attempts.service.ts',
    '!auth/mfa/mfa.service.ts',
    '!auth/tokens/user-tokens.service.ts',
    '!auth/password/password.service.ts',
    '!sessions/sessions.service.ts',
    '!users/*.service.ts',
    '!rgpd/rgpd.service.ts',
    '!audit/audit.service.ts',
    '!mail/mail.service.ts',
    '!mail/mail.processor.ts',
    '!mail/transports/outbox.transport.ts',
    '!jobs/retention/*.ts',
    '!cli/**',
    '!**/dto/**',
    // Phase 3 : services adossés à Postgres/Redis/S3, couverts par les tests e2e.
    '!storage/**',
    '!media/media.service.ts',
    '!media/media-processing.service.ts',
    '!media/media.processor.ts',
    '!content/**/*.service.ts',
    // Le rendu Markdown est pur : il reste couvert par les tests unitaires.
    'content/markdown/markdown.service.ts',
    '!content/common/*.ts',
    // Phase 4 : services du traiteur adossés à Postgres/Redis, couverts par les tests e2e
    // (seuil dans test/jest-e2e.config.ts). La logique métier pure (catering/domain) reste ici.
    '!catering/catalog/*.service.ts',
    '!catering/requests/*.service.ts',
    '!catering/slots/*.service.ts',
    // Phase 5 : services de la boutique adossés à Postgres/Redis/S3 (e2e) ; la logique pure
    // (shop/domain), la signature des liens et le rendu des factures restent ici.
    '!shop/cart/*.service.ts',
    '!shop/catalog/*.service.ts',
    '!shop/shipping/*.service.ts',
    '!shop/stock/*.ts',
    '!shop/orders/checkout.service.ts',
    '!shop/orders/orders.service.ts',
    '!shop/orders/order-expiry.service.ts',
    '!shop/invoices/invoices.service.ts',
    '!shop/worker/**',
    // Phase 6 : services de paiement adossés à Postgres/Redis et aux prestataires (e2e, faux
    // prestataires) ; conversions, liste d'IP et interprétation des preuves restent ici.
    '!payments/*.service.ts',
    '!payments/webhooks/*.service.ts',
    '!payments/worker/**',
    '!payments/gateways/paypal.gateway.ts',
    // Phase 7 : services des formations adossés à Postgres/Redis/S3 (e2e) ; la logique pure
    // (courses/domain), les rendus PDF et le filigrane restent ici.
    '!courses/**/*.service.ts',
    'courses/video/video.service.ts',
    '!documents/**',
    // Phase 8 : contact et newsletter adossés à Postgres/Redis (e2e) ; le signeur reste ici.
    '!contact/*.service.ts',
    '!newsletter/*.service.ts',
    // Phase 9 : administration adossée à Postgres/Redis (e2e) ; la série du tableau de bord et le
    // registre des paramètres restent ici (la série est testée via sa fonction exportée).
    '!admin/**/*.service.ts',
    '!settings/settings-admin.service.ts',
  ],
  coverageDirectory: '../coverage/unit',
  coverageThreshold: { global: { lines: 80, branches: 70 } },
};

export default config;
