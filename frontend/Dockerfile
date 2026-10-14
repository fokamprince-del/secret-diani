# syntax=docker/dockerfile:1.7
# Image « Les Secrets de Diani » — frontend Next.js (serveur autonome `output: 'standalone'`).
# Les variables NEXT_PUBLIC_* sont figées dans le JavaScript au build : elles sont des
# arguments de build, pas des variables d'exécution. Aucun secret ici.

ARG NODE_IMAGE=node:24-alpine

# --- Dépendances --------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-fund --no-audit

# --- Build --------------------------------------------------------------------------------
FROM deps AS build
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MEDIA_URL
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ARG NEXT_PUBLIC_PLAUSIBLE_SRC
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# --- Exécution ----------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=5173 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# Serveur autonome, déjà complété par `postbuild` (fichiers statiques et public/).
COPY --from=build --chown=node:node /app/.next/standalone ./
USER node
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5173/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
