# syntax=docker/dockerfile:1.7
# Image multi-étapes « Les Secrets de Diani » — API et worker partagent la même image.
#   target `runtime` : image de production minimale (dépendances de prod, utilisateur non-root)
#   target `migrate` : CLI Prisma (`prisma migrate deploy` à chaque déploiement) et données de
#                      référence (`prisma db seed`, qui réutilise des modules de src/)

ARG NODE_IMAGE=node:24-alpine

# --- Dépendances complètes (build + CLI Prisma) -----------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-fund --no-audit && npx prisma generate

# --- Compilation --------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# --- Dépendances de production uniquement -------------------------------------------------
# Sans les dépendances facultatives (CLI Prisma, TypeScript, moteurs de migration) ni scripts
# d'installation. Sont repris de l'étape `deps` (même base Alpine) : le client Prisma déjà
# généré et les binaires précompilés de sharp (@img : libvips pour linuxmusl).
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts --no-fund --no-audit
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@img ./node_modules/@img

# --- Migrations (CLI Prisma) --------------------------------------------------------------
FROM ${NODE_IMAGE} AS migrate
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

# --- Image d'exécution --------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
# openssl requis par le moteur Prisma ; outils de gestion de paquets retirés (surface d'attaque).
RUN apk add --no-cache openssl tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --chown=root:root package.json ./
# Le code appartient à root et n'est pas modifiable par l'utilisateur d'exécution.
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
