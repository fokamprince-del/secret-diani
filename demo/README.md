# Démo en ligne depuis ce poste

Pour montrer le site à la cliente avant l'achat du VPS : tout tourne sur ce PC (base, API, site) et un **tunnel Cloudflare gratuit** le rend accessible en https depuis n'importe quel téléphone. Le site est complet : vraie base de données (`diani_demo`, séparée de la base de développement), comptes, panier, demandes traiteur.

## Lancer

Prérequis : Docker Desktop démarré, Node 24, `cloudflared` (`scoop install cloudflared`).

```powershell
node demo/start.mjs
```

Au bout de 3 à 5 minutes, le terminal affiche l'adresse publique (`https://…trycloudflare.com`). **Ctrl+C** arrête tout. Journaux : `demo/logs/`.

## À savoir

- **Le PC doit rester allumé**, connecté, et la commande lancée : c'est lui qui sert le site.
- **L'adresse change à chaque lancement** (tunnel « rapide » sans compte Cloudflare). Le site est alors reconstruit pour la nouvelle adresse (2 à 4 minutes de plus). Pour une adresse fixe : compte Cloudflare + nom de domaine (tunnel nommé), comme en production.
- **Non référencé** : chaque page porte `X-Robots-Tag: noindex`.
- **Paiements** : aucun prestataire configuré, la commande en ligne s'arrête avant le paiement.
- **E-mails** : sans clé Resend, ils ne partent pas (copie dans `backend/tmp/mails/`). La confirmation d'inscription par e-mail ne peut donc pas aboutir : préférer la **connexion avec Google**, ou ajouter une clé Resend.

## Connexion avec Google et e-mails

Copier `demo/.env.demo.example` en `demo/.env.demo` (jamais commité) et renseigner :

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` : voir `backend/docs/RUNBOOK.md` › « Connexion avec Google ». **À chaque nouvelle adresse de tunnel**, ajouter l'URI de redirection affichée au lancement dans la console Google (Identifiants › votre ID client › URI de redirection autorisées). Tant que l'écran de consentement est en mode « Test », ajouter l'adresse Gmail de la cliente comme utilisatrice test.
- `RESEND_API_KEY` (et `MAIL_FROM` d'un domaine vérifié chez Resend) pour envoyer les vrais e-mails.

Relancer ensuite `node demo/start.mjs`.

## Repartir de zéro

La base `diani_demo` garde les comptes et demandes créés pendant la démo. Pour la vider :

```powershell
docker compose -f backend/docker-compose.yml exec postgres psql -U diani -d diani -c "DROP DATABASE diani_demo;"
```

Elle est recréée et ré-amorcée au lancement suivant.
