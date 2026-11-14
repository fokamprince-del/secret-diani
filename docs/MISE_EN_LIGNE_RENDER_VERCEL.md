# Mise en ligne : API sur Render, site sur Vercel, base Neon

Procédure complète, dans l'ordre. Comptez une demi-journée la première fois.
Sans Docker et sans Redis : l'API garde son petit état en mémoire et envoie elle-même les
e-mails, PDF et images (un seul service Render, une seule instance).

## 0. Ce qu'il vous faut avant de commencer

| Compte | Pour quoi | Prix de départ |
|---|---|---|
| **Nom de domaine** (OVH, Gandi, Cloudflare…) | `lessecretsdediani.fr` | ~10 €/an |
| **Neon** | Base de données | Fait (déjà en place) |
| **Render** | API | Starter ~7 $/mois (l'offre gratuite s'endort) |
| **Vercel** | Site | Gratuit (Hobby) |
| **Cloudflare** | Stockage des photos (R2) + anti-robot (Turnstile) | Gratuit jusqu'à 10 Go |
| **Resend** | E-mails (inscription, mot de passe oublié, commandes…) | Gratuit jusqu'à 3 000/mois |
| **Stripe** | Paiement par carte | Commission par paiement |

> **Indispensable : un vrai nom de domaine pour les deux.** La connexion repose sur un cookie
> sécurisé que les navigateurs ne transmettent qu'entre adresses du même domaine. Il faut donc
> `lessecretsdediani.fr` (Vercel) **et** `api.lessecretsdediani.fr` (Render). Avec les adresses
> par défaut (`…vercel.app` et `…onrender.com`), le site s'affiche mais **personne ne peut se
> connecter**.

## 1. Générer les secrets (une fois, sur votre ordinateur)

Dans un terminal :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # → JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → FIELD_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # → REVALIDATE (même valeur des deux côtés)
```

Gardez-les dans un gestionnaire de mots de passe. **Ne perdez jamais `FIELD_ENCRYPTION_KEY`** :
sans elle, les doubles authentifications des administrateurs ne peuvent plus être lues.

## 2. Base Neon (déjà faite)

Les migrations et les données de référence sont appliquées. Deux adresses servent :

- `DATABASE_URL` : celle de votre `backend/.env` actuel (rôle `diani_app`, hôte `-pooler`).
- `DIRECT_URL` : celle de votre `backend/.env` (rôle `neondb_owner`, sans `-pooler`).

Offre gratuite de Neon : la base s'endort après 5 minutes sans visite et met une à deux
secondes à se réveiller (première page un peu plus lente). L'offre payante supprime ce délai.

Conseil sécurité : changez le mot de passe de `neondb_owner` dans la console Neon
(Roles → Reset password) puis mettez à jour `DIRECT_URL` partout.

## 3. Stockage des photos : Cloudflare R2

1. Cloudflare → R2 → **Create bucket** : `diani-public`, puis `diani-private`.
2. `diani-public` → Settings → **Public access** : activez le domaine `r2.dev` (ou mieux, un
   domaine personnalisé `medias.lessecretsdediani.fr`). Notez l'adresse → `MEDIA_PUBLIC_BASE_URL`
   et `NEXT_PUBLIC_MEDIA_URL`.
3. Sur **les deux** buckets → Settings → **CORS policy** (le back-office y dépose les photos
   directement depuis le navigateur) :

   ```json
   [
     {
       "AllowedOrigins": ["https://lessecretsdediani.fr", "https://www.lessecretsdediani.fr"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. R2 → **Manage API tokens** → Create token « Object Read & Write » limité aux deux buckets.
   Notez : Access Key ID → `S3_ACCESS_KEY_ID`, Secret → `S3_SECRET_ACCESS_KEY`,
   endpoint `https://<ID-de-compte>.r2.cloudflarestorage.com` → `S3_ENDPOINT` et
   `NEXT_PUBLIC_STORAGE_UPLOAD_URL`. Région : `auto` → `S3_REGION`.

## 4. E-mails : Resend

1. Resend → **Domains** → Add domain `lessecretsdediani.fr` → ajoutez chez votre registraire les
   enregistrements DNS affichés (SPF, DKIM, et le MX de retour). Attendez « Verified ».
2. **API Keys** → Create (permission « Sending access ») → `RESEND_API_KEY`.
3. `MAIL_FROM` = `Les Secrets de Diani <ne-pas-repondre@lessecretsdediani.fr>`,
   `MAIL_REPLY_TO` = l'adresse où Diani lit ses e-mails.

Les e-mails déjà prêts dans l'API : confirmation d'inscription, **bienvenue** (une fois
l'adresse confirmée), **code de mot de passe oublié**, mot de passe changé, **accès à une
formation après achat**, confirmation de commande avec facture, expédition, remboursement,
accusé de demande traiteur (et notification à Diani), messages de contact, newsletter.

## 5. Anti-robot : Cloudflare Turnstile

Cloudflare → Turnstile → Add widget, domaine `lessecretsdediani.fr`, mode « Managed ».
Clé du site → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Vercel) ; clé secrète → `TURNSTILE_SECRET_KEY` (Render).

## 6. Paiement : Stripe

1. Stripe → Developers → API keys → **Secret key** (`sk_live_…`, ou `sk_test_…` pour essayer)
   → `STRIPE_SECRET_KEY`.
2. Après l'étape 7 (quand l'API a son adresse) : Developers → Webhooks → Add endpoint
   `https://api.lessecretsdediani.fr/api/v1/payments/webhooks/stripe`, événements :
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
   `charge.refund.updated`, `charge.dispute.created`. Secret de signature (`whsec_…`)
   → `STRIPE_WEBHOOK_SECRET`.

En production, l'API refuse de démarrer sans au moins un moyen de paiement : mettez d'abord
les clés **de test** si Stripe n'est pas encore validé.

## 7. API sur Render

1. Poussez le code sur GitHub (c'est fait sur la branche du projet ; fusionnez dans `main`).
2. Render → **New → Blueprint** → choisissez le dépôt : Render lit `render.yaml` à la racine.
3. Renseignez les variables demandées :

| Variable | Valeur |
|---|---|
| `PUBLIC_SITE_URL` | `https://lessecretsdediani.fr` |
| `PUBLIC_API_URL` | `https://api.lessecretsdediani.fr` |
| `CORS_ORIGINS` | `https://lessecretsdediani.fr,https://www.lessecretsdediani.fr` |
| `DATABASE_URL` / `DIRECT_URL` | étape 2 |
| `JWT_ACCESS_SECRET` / `FIELD_ENCRYPTION_KEY` | étape 1 |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | étape 4 |
| `TURNSTILE_SECRET_KEY` | étape 5 |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | étape 6 |
| `S3_ENDPOINT`, `S3_REGION` (`auto`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | étape 3 |
| `S3_BUCKET_PRIVATE` / `S3_BUCKET_PUBLIC` | `diani-private` / `diani-public` |
| `MEDIA_PUBLIC_BASE_URL` | étape 3 (adresse publique du bucket public) |
| `FRONTEND_REVALIDATE_URL` | `https://lessecretsdediani.fr/api/revalidate` |
| `FRONTEND_REVALIDATE_SECRET` | étape 1 (la valeur « REVALIDATE ») |

4. **Deploy**. Render installe, compile, applique les migrations (`npm run db:deploy`) puis
   démarre. Contrôle : `https://<service>.onrender.com/ready` doit répondre `"ready": true`.
5. Settings → **Custom Domains** → `api.lessecretsdediani.fr` → ajoutez le CNAME indiqué chez
   votre registraire.

Connexion Google (facultatif) : console Google Cloud → identifiants OAuth « Application Web »,
URI de redirection `https://api.lessecretsdediani.fr/api/v1/auth/google/callback`, puis
`GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sur Render.

## 8. Site sur Vercel

1. Vercel → **Add New → Project** → importez le dépôt → **Root Directory : `frontend`**
   (Framework : Next.js, détecté).
2. Environment Variables (Production) — **avant** le premier déploiement, car les
   `NEXT_PUBLIC_*` sont figées à la compilation :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://lessecretsdediani.fr` |
| `NEXT_PUBLIC_API_URL` | `https://api.lessecretsdediani.fr` |
| `NEXT_PUBLIC_MEDIA_URL` | étape 3 (= `MEDIA_PUBLIC_BASE_URL`) |
| `NEXT_PUBLIC_STORAGE_UPLOAD_URL` | étape 3 (= `S3_ENDPOINT`) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | étape 5 |
| `REVALIDATE_SECRET` | étape 1 (même valeur que `FRONTEND_REVALIDATE_SECRET`) |

3. **Deploy**, puis Settings → **Domains** → `lessecretsdediani.fr` et `www` (Vercel indique
   les enregistrements DNS).
4. Toute modification d'une variable `NEXT_PUBLIC_*` → **Redeploy**.

## 9. Premier compte administrateur

Depuis votre ordinateur (votre `backend/.env` pointe déjà sur Neon) :

```bash
cd backend
npx ts-node --transpile-only src/cli/create-admin.ts
```

Saisissez l'e-mail et le mot de passe de Diani. À sa première connexion sur
`https://lessecretsdediani.fr/connexion`, elle scanne le QR code avec Google Authenticator,
note ses codes de secours, et arrive directement dans **l'administration** (`/admin`).
Créez aussi un **second administrateur** (vous) : c'est lui qui pourra réinitialiser la double
authentification de Diani si elle perd son téléphone.

## 10. Vérifications finales

1. `https://api.lessecretsdediani.fr/ready` → `ready: true`.
2. Inscription d'un compte test → e-mail reçu → lien → e-mail de bienvenue.
3. « Mot de passe oublié » → code à 6 chiffres reçu.
4. Demande de devis traiteur → accusé reçu par la cliente, notification reçue par Diani,
   demande visible dans Administration › Demandes & devis.
5. Achat d'un pack en mode **test** Stripe (carte `4242 4242 4242 4242`) → e-mail d'accès à la
   formation, accès dans l'espace membre.
6. Administration › Médiathèque → envoyer une photo → elle apparaît, optimisée.
7. Administration › Paramètres › Mentions légales : SIRET, adresse, TVA (factures).

## Plus tard

- **Redis** (Upstash, gratuit) : seulement pour faire tourner plusieurs instances de l'API.
  Ajoutez `REDIS_URL=rediss://…` sur Render et un second service « worker »
  (`npm run start:worker`) : rien d'autre à changer.
- **Photos HD** : demandez à Diani d'envoyer les fichiers d'origine (WhatsApp → « Document »,
  ou AirDrop/Google Drive), pas des photos passées par WhatsApp ou Instagram, qui les réduisent
  à 720 px et les compressent. Elle peut ensuite les déposer elle-même dans la Médiathèque.
