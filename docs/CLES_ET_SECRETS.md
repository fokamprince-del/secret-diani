# Clés API et secrets — Les Secrets de Diani

Liste complète de ce qu'il faut fournir, à quoi ça sert, où l'obtenir et où le mettre.
**Aucune de ces valeurs ne doit être commitée** : elles vont dans `demo/.env.demo` (démo),
`backend/.env` (développement) ou l'environnement du serveur (production).

## 1. À obtenir auprès de prestataires (comptes à créer)

| Variable | Service | À quoi ça sert | Où l'obtenir | Obligatoire en production |
|---|---|---|---|---|
| `RESEND_API_KEY` | Resend | Envoi des e-mails : confirmation d'inscription, code de mot de passe oublié, confirmation de commande avec facture, accusés de réception | resend.com → **API Keys** → *Create* (droit « Sending access ») | Oui |
| `MAIL_FROM` | Resend | Expéditeur, ex. `Les Secrets de Diani <ne-pas-repondre@lessecretsdediani.fr>` | Le domaine doit être **vérifié** dans Resend → *Domains* (DKIM, SPF : voir `backend/docs/RUNBOOK.md`) | Oui |
| `MAIL_REPLY_TO` | — | Adresse qui reçoit les réponses des clientes | Votre adresse de contact | Recommandé |
| `GOOGLE_CLIENT_ID` | Google Cloud | Connexion avec Google | console.cloud.google.com → *API et services* → *Identifiants* → *ID client OAuth* (Application Web) | Non (facultatif) |
| `GOOGLE_CLIENT_SECRET` | Google Cloud | Idem (va avec l'identifiant) | Même écran que l'identifiant | Non |
| `STRIPE_SECRET_KEY` | Stripe | Paiement par carte (clé restreinte `rk_…` de préférence) | dashboard.stripe.com → *Développeurs* → *Clés API* | Stripe **ou** PayPal |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Vérifier que les notifications de paiement viennent bien de Stripe | *Développeurs* → *Webhooks* → endpoint `https://<api>/api/v1/payments/webhooks/stripe` → *Signing secret* (`whsec_…`) | Avec Stripe |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal | Paiement PayPal | developer.paypal.com → *Apps & Credentials* → application REST | Stripe **ou** PayPal |
| `PAYPAL_WEBHOOK_ID` | PayPal | Vérifier les notifications PayPal | Même application → *Webhooks* → endpoint `https://<api>/api/v1/payments/webhooks/paypal` | Avec PayPal |
| `PAYPAL_ENVIRONMENT` | PayPal | `sandbox` pour les essais, `live` pour les vrais paiements | — | Avec PayPal |
| `TURNSTILE_SECRET_KEY` | Cloudflare | Anti-robot des formulaires publics (côté serveur) | dash.cloudflare.com → *Turnstile* → *Add site* | Oui |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare | Même widget, clé publique (côté site) | Même écran (« Site key ») | Oui |
| `BUNNY_STREAM_CDN_HOST` | Bunny.net | Diffusion protégée des vidéos de formation | bunny.net → *Stream* → bibliothèque → *API* (nom d'hôte `vz-….b-cdn.net`) | Pour les formations |
| `BUNNY_STREAM_TOKEN_KEY` | Bunny.net | Signer les liens vidéo | Bibliothèque → *Security* → *Token authentication* | Pour les formations |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PRIVATE`, `S3_BUCKET_PUBLIC` | OVH Object Storage (ou autre S3) | Photos, factures PDF, supports de formation, sauvegardes | Espace client OVH → *Public Cloud* → *Object Storage* → utilisateur S3 | Oui |
| `MEDIA_PUBLIC_BASE_URL` | idem | Adresse publique des images | URL du bucket public (ou du CDN devant) | Oui |
| `SENTRY_DSN` | Sentry | Alertes d'erreurs | sentry.io → projet → *Client Keys (DSN)* | Non (recommandé) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Plausible | Mesure d'audience respectueuse (avec consentement) | plausible.io → ajouter le site | Non |

## 2. À générer soi-même (jamais partagés)

| Variable | À quoi ça sert | Comment la générer |
|---|---|---|
| `JWT_ACCESS_SECRET` | Signature des sessions de connexion | `openssl rand -base64 48` |
| `FIELD_ENCRYPTION_KEY` | Chiffrement des secrets de double authentification (32 octets) | `openssl rand -base64 32` — **à conserver hors de la base et des sauvegardes** |
| `FRONTEND_REVALIDATE_SECRET` (API) = `REVALIDATE_SECRET` (site) | L'API prévient le site qu'un contenu a changé | `openssl rand -hex 32` (la même valeur des deux côtés) |
| `POSTGRES_PASSWORD`, mot de passe du rôle `diani_app` | Base de données | `openssl rand -base64 32` |

Les anciennes valeurs (`JWT_ACCESS_SECRET_PREVIOUS`, `FIELD_ENCRYPTION_KEY_PREVIOUS`) ne servent que pendant une rotation (voir `backend/docs/RUNBOOK.md`, « Rotation des secrets »).

## 3. Réglages (pas secrets)

`PUBLIC_SITE_URL` (https://lessecretsdediani.fr), `PUBLIC_API_URL`, `CORS_ORIGINS`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MEDIA_URL`, `NEXT_PUBLIC_GOOGLE_AUTH=true` (si Google est configuré), `TRUST_PROXY_HOPS=2` (Cloudflare + Traefik), `DATABASE_URL`, `REDIS_URL`.

## 4. Déploiement automatique (GitHub → serveur)

Dans le dépôt GitHub → *Settings* → *Secrets and variables* → *Actions* :

- secrets : `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` ;
- variables : `SITE_DOMAIN`, `API_DOMAIN`, `MEDIA_URL`, `TURNSTILE_SITE_KEY`, `PLAUSIBLE_DOMAIN`.

## 5. Pour la démo actuelle (`demo/.env.demo`)

Seules trois valeurs sont utiles pour l'instant : `RESEND_API_KEY` (+ `MAIL_FROM` d'un domaine vérifié chez Resend), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Le reste est généré ou réglé par `node demo/start.mjs`.

**Resend sans domaine vérifié** : Resend n'autorise alors l'envoi qu'**à l'adresse du compte Resend** lui-même (expéditeur `onboarding@resend.dev`). Pour écrire à n'importe quelle cliente, il faut vérifier un domaine.
