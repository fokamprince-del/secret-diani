# Sécurité

> Document construit au fil des phases. Version actuelle : socle (phase 1), authentification / comptes (phase 2), traiteur (phase 4), boutique (phase 5), paiements (phase 6) et formations (phase 7) ; la phase 3 (contenus, médias) est à compléter (constat N4 de l’audit). La revue complète (OWASP ASVS niveau 2 sur tout le périmètre, scan de l'image, test de charge) a lieu en phase 10.

## Modèle de menaces — authentification et comptes (STRIDE)

| Menace | Scénario | Mesures | Preuves (tests) |
|---|---|---|---|
| **S**poofing | Force brute ou credential stuffing sur la connexion | Argon2id (OWASP), verrouillage progressif par couple e-mail+IP, par e-mail et par IP ; limite de 10 connexions/min/IP ; refus des mots de passe courants | `auth.e2e` › verrouillage progressif, limitation de débit ; `password-policy.spec` |
| S | Vol de session administrateur | 2FA TOTP obligatoire, anti-rejeu, sessions de 10 min / 1 h / 12 h, alerte e-mail à chaque connexion | `admin-mfa.e2e` |
| S | Vol d'un refresh token | Cookie `HttpOnly; Secure; SameSite=Strict` limité à `/api/v1/auth`, rotation à chaque usage, réutilisation → famille révoquée | `auth.e2e` › renouvellement |
| **T**ampering | JWT forgé ou modifié | HS256 imposé (`alg: none` refusé), émetteur et audience vérifiés, secret ≥ 32 caractères | `access-token.service.spec`, `auth.e2e` › jeton altéré |
| T | Mass assignment (`role: admin`) | `whitelist` + `forbidNonWhitelisted`, DTO stricts | `auth.e2e` › mass assignment, `account.e2e` › champs protégés |
| T | Modification du journal d'audit | Déclencheur PostgreSQL : UPDATE, TRUNCATE et DELETE récents interdits ; l'API se connecte avec `diani_app`, qui n'est ni superutilisateur ni propriétaire et ne peut donc pas désactiver le déclencheur | `account.e2e` › journal immuable, rôle de l'API |
| **R**epudiation | Contestation d'une action sensible | `audit_logs` : connexions, échecs, verrouillages, mots de passe, e-mails, 2FA, sessions, export et suppression | `admin-mfa.e2e`, `account.e2e` |
| **I**nformation disclosure | Énumération des comptes | Messages et codes identiques, durée minimale de 400 ms, empreinte factice | `auth.e2e` › anti-énumération, durée de réponse |
| I | IDOR (adresses, sessions d'un autre compte) | Filtre systématique sur l'utilisateur authentifié, 404 indiscernable | `account.e2e` › anti-IDOR |
| I | Fuite de données personnelles dans les journaux | Sérialiseurs pino (méthode, chemin, statut), masquage des clés sensibles, e-mails journalisés par gabarit uniquement | `pino-options.spec`, essai de fumée (D-035) |
| I | Fuite d'un secret 2FA ou d'un code de secours | AES-256-GCM au repos, codes en HMAC avec clé hors base | `field-encryption.service.spec`, `admin-mfa.e2e` |
| **D**enial of service | Verrouiller le compte d'une victime | Verrous temporaires (15 min au plus), le couple e-mail+IP ne bloque pas les autres IP | `login-attempts.spec`, `auth.e2e` |
| D | Saturation de la boîte d'une victime | 3 e-mails par heure et par adresse et par usage | `auth.e2e` › renvoi limité |
| **E**levation of privilege | Accès admin sans 2FA, client sur route admin | Garde globale « refus par défaut », `@Roles`, jeton admin sans `mfa` refusé | `guards.spec`, `admin-mfa.e2e` › RBAC |
| E | CSRF sur les routes à cookie | SameSite=Strict + en-tête obligatoire + origine vérifiée + Sec-Fetch-Site | `guards.spec` › CsrfGuard, `auth.e2e` › CSRF |

## Modèle de menaces — traiteur (phase 4, STRIDE)

| Menace | Scénario | Mesures | Preuves (tests) |
|---|---|---|---|
| **S**poofing | Robot qui inonde le formulaire « Demande personnalisée » | 3 envois / 10 min / IP, piège à robots (succès simulé, rien d'enregistré), Cloudflare Turnstile obligatoire en production, refus si Cloudflare est injoignable | `catering.e2e` › piège à robots, débit ; `captcha.service.spec` ; `env.schema.spec` › Turnstile |
| **T**ampering | Prix modifié par le client | La sélection ne porte que des identifiants de variantes ; total, acompte et lignes calculés et figés par le serveur ; tout champ de prix est refusé | `catering.e2e` › « ne croit jamais un prix envoyé par le client » |
| T | Confirmation sans acompte, ou acompte arrangé | Machine à états, mise à jour conditionnelle, contrainte CHECK ; acompte calculé par la règle (D-041), total figé après réception | `catering-domain.spec`, `catering.e2e` › suivi par l'administration |
| T | Surbooking d'un créneau (parcours avancé) | Verrou `SELECT … FOR UPDATE` sur le créneau avant le comptage | `catering.e2e` › 4 commandes simultanées, 1 acceptée |
| **R**epudiation | Contestation d'un acompte ou d'une annulation | Historique par demande (qui, quoi, quand, motif), journal d'audit | `catering.e2e` › historique complet |
| **I**nformation disclosure | Lecture des demandes par une cliente | Routes `admin/*` sous `@Roles('admin')` + 2FA ; aucune route publique ne lit une demande | `catering.e2e` › 401/403 |
| I | Notes internes ou message libre exposés | Le récapitulatif et les e-mails à la cliente n'incluent ni notes ni message ; le message libre n'est envoyé qu'à l'administration (HTML échappé) | `catering.e2e` › récapitulatif, `render.spec` › échappement |
| **D**enial of service | Bombardement d'e-mails vers une victime (adresse saisie par un tiers) | Accusé de réception limité à 3 par jour et par adresse, sans le message libre | `catering.e2e` › anti-bombardement |
| **E**levation of privilege | Cliente sur l'administration du catalogue | Garde globale « refus par défaut » + rôle admin + 2FA | `catering.e2e` › 403 |

## Modèle de menaces — boutique (phase 5, STRIDE)

| Menace | Scénario | Mesures | Preuves (tests) |
|---|---|---|---|
| **S**poofing | Lire la commande ou la facture d'une autre personne | Lien de suivi signé (HMAC 128 bits, clé dérivée hors base) ; espace client filtré sur le compte, 404 indiscernable | `order-link.service.spec`, `shop.e2e` › lien falsifié, anti-IDOR |
| S | Deviner le panier d'une autre personne | Jeton aléatoire de 256 bits, seule l'empreinte en base | `shop.e2e` › cookie inventé |
| **T**ampering | Prix modifié par le client | Aucun prix accepté ni stocké dans le panier ; prix, frais de port et total recalculés par le serveur et figés dans la commande | `shop.e2e` › prix envoyé refusé |
| T | **Survente** (deux paniers pour la dernière pièce) | Mises à jour conditionnelles atomiques, ordre fixe des verrous, contraintes CHECK `0 <= reserved <= on_hand` | `shop.e2e` › 5 paniers pour 1 pièce |
| T | Paiement compté deux fois (webhook rejoué) | Verrou de la commande, confirmation idempotente (une seule vente, une seule facture) | `shop.e2e` › « already_paid » |
| T | Facture modifiée ou supprimée | Déclencheur : contenu inaltérable, suppression interdite avant 10 ans, même pour le rôle de l'API | `shop.e2e` › facture inaltérable |
| T | Injection de formules dans l'export CSV | Cellules commençant par `= + - @` neutralisées | `shop-domain.spec`, `shop.e2e` › export CSV |
| **R**epudiation | Contestation d'une expédition, d'un ajustement de stock | Historique des commandes et des mouvements de stock (qui, quoi, quand), journal d'audit | `shop.e2e` |
| **I**nformation disclosure | Notes internes visibles de la cliente | Historique sans notes dans les vues cliente et lien de suivi | `shop.e2e` › vue cliente |
| **D**enial of service | Robot qui immobilise le stock en validant des paniers | Plafond par article, 5 validations / 10 min / IP, Turnstile, une seule réservation par panier, expiration à 15 min | `shop.e2e` › limite et revalidation |
| D | CSRF sur le panier invité (cookie) | `SameSite=Strict` + en-tête obligatoire + origine vérifiée | `shop.e2e` › en-tête CSRF exigé |
| **E**levation of privilege | Cliente sur l'administration, invitée qui se fait passer pour connectée | Rôle admin + 2FA ; jeton invalide sur une route facultative → 401 (jamais invité) | `guards.spec` › `@OptionalAuth()`, `shop.e2e` |

## Modèle de menaces — paiements (phase 6, STRIDE)

| Menace | Scénario | Mesures | Preuves (tests) |
|---|---|---|---|
| **S**poofing | Faux webhook « paiement réussi » | Signature vérifiée sur le corps brut (Stripe : SDK officiel ; PayPal : API de vérification + identifiant du webhook), horodatage de 5 min, liste d'IP facultative | `payments.e2e` › webhook mal signé, modifié, trop ancien |
| S | Valider une commande sans payer (retour PayPal forgé) | La capture est faite par le serveur auprès de PayPal ; seule une capture « COMPLETED » au bon montant fait foi | `payments.e2e` › PayPal, paiement refusé |
| **T**ampering | Montant payé inférieur au prix (session modifiée) | Montants de la session issus de la commande figée ; total vérifié à la création et à la confirmation ; écart → aucune validation + alerte | `payments.e2e` › montant incohérent |
| T | Pollution de prototype par un webhook PayPal | Analyse JSON refusant `__proto__`, `constructor`, `prototype` | `payments.e2e` › webhook PayPal |
| **R**epudiation | Contestation d'un paiement ou d'un remboursement | `payments`, `refunds`, `webhook_events` (contenu vérifié, 90 jours) ; audit : début, réussite, échec, écart, litige, remboursements, webhooks refusés | `payments.e2e` |
| R | Webhook rejoué | Unicité (prestataire, identifiant d'événement) ; confirmation et remboursement idempotents | `payments.e2e` › rejeu, deux webhooks simultanés |
| **I**nformation disclosure | Données de carte | Jamais reçues ni stockées (pages hébergées, PCI DSS SAQ A) ; seuls les identifiants du prestataire sont gardés | — |
| **D**enial of service | Inondation des webhooks | Limite de 600/min, traitement asynchrone, réponse immédiate | — |
| D | Paiement perdu (webhook non reçu) | Réconciliation quotidienne avec les prestataires | `payments.e2e` › réconciliation |
| **E**levation of privilege | Remboursement par une cliente, ou au-delà du payé | Rôle admin + 2FA ; montant contrôlé sous verrou (payé − remboursé − en cours) | `payments.e2e` › remboursements |

**Argent encaissé sans contrepartie** : double paiement ou stock épuisé après expiration → remboursement automatique intégral (`payments.e2e` › remboursements automatiques).

## Modèle de menaces — formations (phase 7, STRIDE)

| Menace | Scénario | Mesures | Preuves (tests) |
|---|---|---|---|
| **S**poofing | Accès à une leçon payante sans pack | Accès vérifié à chaque requête (leçon, progression, quiz, fiche) ; leçon d'exemple seule ouverte ; pack inférieur ≠ supérieur | `courses.e2e` › leçon payante, Essentiel n'ouvre pas Premium |
| S | Accès ouvert sans paiement réel | Accès créé seulement dans la transaction de confirmation du paiement (webhook signé) ; retiré au remboursement intégral | `courses.e2e` › accès après le webhook uniquement, remboursement |
| **T**ampering | Réussir un quiz sans connaître les réponses | Correction côté serveur ; réponses jamais envoyées avant correction, masquées tant qu'il reste des tentatives ; tentatives limitées | `courses-domain.spec`, `courses.e2e` › quiz |
| T | Progression ou position falsifiées | Position bornée à la durée de la vidéo ; débit limité ; seule la cliente concernée écrit sa progression | `courses.e2e` › reprise de lecture |
| **R**epudiation | Contestation d'un accès offert ou retiré | Accès avec source, auteur et note ; journal d'audit (accordé, retiré, certificat émis, appel demandé) | `courses.e2e` › accès accordés |
| **I**nformation disclosure | Vidéo partagée par lien | URL signée par jeton de répertoire, durée = vidéo + 30 min (4 h max), liaison IP facultative | `courses-domain.spec`, `courses.e2e` › vidéo signée |
| I | Fiche PDF partagée | URL signée de 5 min ; filigrane nom + e-mail sur chaque page | `courses-pdf.spec`, `courses.e2e` › filigrane |
| I | Énumération des titulaires de certificats | Numéro aléatoire de 40 bits ; certificat révoqué à la suppression du compte (nom masqué) | `courses-domain.spec`, `courses.e2e` › RGPD |
| **D**enial of service | Abus des appels inclus | Quota calculé sous verrou ; 3 demandes / heure | `courses.e2e` › avantages |
| **E**levation of privilege | Cliente sur l'administration des formations | Rôle admin + 2FA | `courses.e2e` › accès accordés (403) |

## Modèle de menaces — contact et newsletter (phase 8, STRIDE)

| Menace | Scénario | Mesures | Preuves (tests) |
|---|---|---|---|
| **S**poofing | Inscrire l'adresse d'un tiers à la newsletter | Double opt-in : rien n'est actif sans clic sur le lien reçu ; lien à usage unique, 7 jours | `contact-newsletter.e2e` › double opt-in, lien expiré |
| S | Désinscrire quelqu'un d'autre | Lien signé HMAC (clé dérivée propre à l'usage) ; un jeton modifié est refusé | `id-signer.spec`, `contact-newsletter.e2e` › jeton falsifié |
| **T**ampering | Injection dans l'e-mail envoyé à Diani | Gabarits échappés, en-têtes construits par le transport (pas de concaténation), champs bornés | `render.spec` |
| **R**epudiation | Contestation d'un consentement | Texte de la case, dates, IP tronquées conservés ; export journalisé | `contact-newsletter.e2e` › preuve du consentement, export |
| **I**nformation disclosure | Savoir si une adresse est inscrite | Réponse identique, aucun e-mail pour une adresse déjà confirmée | `contact-newsletter.e2e` › ne révèle pas |
| I | Données personnelles dans le journal | Journal : identifiant du message seulement, jamais l'e-mail | `contact-newsletter.e2e` › contact |
| **D**enial of service | Formulaires utilisés pour bombarder une boîte ou remplir la base | Débit par IP, piège à robots, Turnstile ; 3 accusés / 3 confirmations par jour et par adresse ; purge des inscriptions non confirmées | `contact-newsletter.e2e` › débit, accusés, purge |
| **E**levation of privilege | Lecture des messages ou de la liste par une cliente | Rôle admin + 2FA | `contact-newsletter.e2e` › 403 / 401 |

## OWASP ASVS 4.0 niveau 2 — chapitres V2 (authentification) et V3 (sessions)

| Exigence | État | Référence |
|---|---|---|
| 2.1.1 Mot de passe ≥ 12 caractères | ✅ | `password-policy.ts`, `auth.e2e` |
| 2.1.2 Au moins 64 caractères autorisés (128) | ✅ | `PASSWORD_MAX_LENGTH` |
| 2.1.3 Pas de troncature, 2.1.4 Unicode accepté | ✅ | `password-policy.spec` (comptage Unicode) |
| 2.1.7 Refus des mots de passe compromis | ✅ (liste locale, D-037) | `password-policy.spec` |
| 2.1.9 Aucune règle de composition imposée | ✅ | — |
| 2.2.1 Anti-automatisation (débit, verrouillage) | ✅ | D-026, `auth.e2e` |
| 2.2.3 Notification après changement d'identifiant | ✅ | e-mails `password-changed`, `email-change-notice` |
| 2.4.1 Stockage par fonction lente et salée (Argon2id) | ✅ | `ARGON2_OPTIONS`, `auth.e2e` |
| 2.5.1 Jeton de réinitialisation aléatoire, à usage unique, court | ✅ | D-028, `auth.e2e` |
| 2.5.2 Pas d'indice ni de question secrète | ✅ | — |
| 2.5.6 Récupération sans révéler l'existence du compte | ✅ | D-031 |
| 2.7/2.8 OTP : usage unique, durée limitée, anti-rejeu | ✅ | D-030, `totp.spec`, `admin-mfa.e2e` |
| 3.2.1 Nouveau jeton de session à chaque authentification | ✅ | `SessionsService.create` |
| 3.2.3 Jetons hors stockage web (cookie HttpOnly) | ✅ | D-025 |
| 3.3.1 Déconnexion invalidant la session | ✅ | `auth.e2e` › déconnexion |
| 3.3.2 Expiration par inactivité et absolue | ✅ | D-024 |
| 3.3.3 Révocation des autres sessions après changement de mot de passe | ✅ | `auth.e2e` › changement de mot de passe |
| 3.3.4 Liste et révocation des sessions actives | ✅ | `account.e2e` › sessions |
| 3.4.1–3.4.3 Cookie Secure, HttpOnly, SameSite | ✅ | `auth.e2e` › connexion |
| 3.5.3 Jetons signés, algorithme imposé | ✅ | `access-token.service.spec` |
| 3.7.1 Ré-authentification pour les actions sensibles | ✅ | mot de passe exigé : changement d'e-mail, de mot de passe, suppression |
| 2.9 / WebAuthn (passkeys) | ⏳ phase 9 | D-030 |

## Secrets

| Secret | Usage | Rotation |
|---|---|---|
| `JWT_ACCESS_SECRET` | Signature des jetons d'accès | `JWT_ACCESS_SECRET_PREVIOUS` accepté en vérification (voir RUNBOOK) |
| `FIELD_ENCRYPTION_KEY` | Secrets 2FA, clé HMAC des codes de secours | `FIELD_ENCRYPTION_KEY_PREVIOUS` accepté en déchiffrement (voir RUNBOOK) |
| `RESEND_API_KEY` | Envoi des e-mails (worker) | Régénérer dans Resend, redéployer |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Paiements Stripe, signature des webhooks | Clé restreinte (`rk_…`) recommandée ; nouvelle clé dans le tableau de bord Stripe, mise à jour de `.env.production`, redéploiement, révocation de l'ancienne. Secret du webhook : « Renouveler le secret » (Stripe accepte les deux pendant 24 h) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | Paiements PayPal, vérification des webhooks | Nouveau secret dans l'application REST PayPal, redéploiement ; le jeton OAuth en cache (Redis) expire de lui-même |
| `TURNSTILE_SECRET_KEY` | Vérification anti-robot des formulaires publics | Faire tourner la clé dans Cloudflare (Turnstile), mettre à jour `.env.production`, redéployer |

`FIELD_ENCRYPTION_KEY` n'est jamais dans la base ni dans ses sauvegardes : perdre cette clé rend les secrets 2FA illisibles (les administrateurs devront alors refaire leur enrôlement).
