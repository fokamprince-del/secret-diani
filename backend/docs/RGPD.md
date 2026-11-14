# Registre des traitements (RGPD / CNIL)

> Tenu à jour à chaque phase. Responsable de traitement : Les Secrets de Diani. Procédure en cas de violation de données : `docs/INCIDENT.md`.

## T1 — Comptes clients (phase 2)

| Rubrique | Contenu |
|---|---|
| Finalité | Création et gestion du compte (accès aux formations, suivi des commandes, adresses enregistrées) |
| Base légale | Exécution du contrat (CGU acceptées à l'inscription) |
| Personnes concernées | Clientes et clients inscrits |
| Données | E-mail, empreinte du mot de passe (Argon2id), prénom, nom, téléphone (facultatif), adresses de livraison et de facturation, consentements horodatés (CGU + version, e-mails d'information) |
| Données techniques | Sessions : navigateur (user-agent), **IP tronquée** (/24 en IPv4, /48 en IPv6), dates. Aucune IP complète n'est stockée. |
| Destinataires | Diani (administration) ; sous-traitants : hébergeur VPS, Resend (envoi des e-mails), OVH (sauvegardes chiffrées) |
| Transferts hors UE | Resend : à encadrer par clauses contractuelles types, à vérifier avant la mise en production (phase 10) |
| Sécurité | Voir `docs/SECURITY.md` : chiffrement TLS, Argon2id, 2FA administrateur, journal d'audit, sauvegardes chiffrées |

**Connexion avec Google (facultative)** : à la connexion, Google transmet l'e-mail (vérifié), le prénom, le nom et un identifiant de compte stable (`google_subject`), seul ajout conservé ; aucun jeton Google n'est stocké. Base légale : exécution du contrat. Destinataire supplémentaire : Google (choix de la personne au moment de se connecter). L'identifiant est effacé à la suppression du compte, qui reste possible sans mot de passe (connexion récente exigée).

### Durées de conservation

| Donnée | Durée | Mécanisme |
|---|---|---|
| Compte actif | Tant que le compte existe | — |
| Compte jamais confirmé | 30 jours après l'inscription | Purge quotidienne (`RetentionService`) |
| Compte supprimé par la personne | Anonymisation immédiate | `DELETE /api/v1/me` |
| Sessions (appareils) | 30 jours après expiration ou déconnexion | Purge quotidienne |
| Refresh tokens, liens envoyés par e-mail | 7 jours après expiration ou usage | Purge quotidienne |
| Journal d'audit (sans donnée personnelle directe) | 1 an | Purge quotidienne ; suppression plus précoce impossible (déclencheur en base) |
| Factures (phases 5-6) | 10 ans (obligation comptable) | Conservées détachées de l'identité après suppression du compte |
| Sauvegardes | 30 jours | Cycle de vie du bucket (voir RUNBOOK) |

### Exercice des droits

| Droit | Mise en œuvre |
|---|---|
| Accès et portabilité | `GET /api/v1/me/export` : fichier JSON (compte, consentements, adresses, sessions, événements de sécurité) |
| Rectification | `PATCH /api/v1/me`, `/api/v1/me/addresses`, changement d'e-mail confirmé |
| Effacement | `DELETE /api/v1/me` (mot de passe exigé) : anonymisation, suppression des adresses, sessions et jetons |
| Retrait du consentement aux e-mails | `PATCH /api/v1/me` (`marketingConsent: false`) ; lien de désinscription en un clic (phase 8) |
| Demande reçue hors ligne (e-mail, courrier) | Après vérification de l'identité : export depuis le back-office (`GET /api/v1/admin/users/:id/export`, journalisé) ; effacement par la personne elle-même ou, à défaut, suspension puis traitement manuel consigné |

## T2 — Demandes et commandes traiteur (phase 4)

| Rubrique | Contenu |
|---|---|
| Finalité | Répondre à une demande de traiteur, établir le devis, suivre l'acompte, la confirmation et la livraison |
| Base légale | Mesures précontractuelles prises à la demande de la personne, puis exécution du contrat |
| Personnes concernées | Toute personne qui envoie une demande (avec ou sans compte), ou dont Diani saisit la demande reçue par WhatsApp ou téléphone |
| Données | Prénom, nom (facultatif), e-mail, téléphone (facultatif), date et lieu de l'événement, nombre d'invités, adresse de livraison (texte libre), message, sélection, montants, moyen de paiement de l'acompte (libellé, aucune donnée bancaire), notes internes de Diani |
| Destinataires | Diani (administration) ; sous-traitants : hébergeur VPS, Resend (accusé de réception, notification), Cloudflare (vérification anti-robot : jeton et IP, sans donnée de la demande) |
| Sécurité | Formulaire protégé (débit, piège à robots, Turnstile), accusés de réception limités par adresse, accès administrateur avec 2FA, historique et journal d'audit. Voir `docs/SECURITY.md` |

| Donnée | Durée | Mécanisme |
|---|---|---|
| Demande (identité, coordonnées, message, notes) | 3 ans après la dernière activité | **Anonymisation** par la purge quotidienne (`RetentionService`) ; montants et sélection conservés sans identité |
| Compteur anti-bombardement (empreinte de l'adresse) | 24 heures | Expiration Redis |

Droit d'accès : `GET /api/v1/me/export` inclut les demandes envoyées avec l'adresse du compte, notes internes comprises. Pour une personne sans compte, Diani répond depuis l'administration (recherche par adresse e-mail). Effacement anticipé sur demande : modification ou annulation depuis l'administration (outil dédié prévu avec le back-office, phase 9).

## T3 — Commandes boutique et facturation (phase 5)

| Rubrique | Contenu |
|---|---|
| Finalité | Vendre les kits et accessoires : panier, commande, livraison ou retrait, facturation, suivi, service après-vente |
| Base légale | Exécution du contrat (CGV acceptées et horodatées à la commande, avec leur version) ; obligation légale pour les factures (conservation comptable) |
| Personnes concernées | Clientes et clients, avec ou sans compte |
| Données | E-mail, prénom, nom, téléphone (facultatif), adresses de livraison et de facturation, articles, montants, transporteur et numéro de suivi, note de la cliente. Aucune donnée de carte bancaire (paiement hébergé par Stripe ou PayPal, phase 6) |
| Panier invité | Jeton aléatoire en cookie strictement nécessaire (panier), seule son empreinte est en base ; aucune donnée personnelle |
| Destinataires | Diani (administration) ; sous-traitants : hébergeur VPS, Resend (confirmation, expédition), OVH (stockage des factures) ; transporteur (adresse de livraison) |
| Sécurité | Voir `docs/SECURITY.md` (modèle de menaces boutique) : lien de suivi signé, anti-IDOR, factures inaltérables |

| Donnée | Durée | Mécanisme |
|---|---|---|
| Panier | 30 jours sans modification (invité), 1 an (compte) | Purge quotidienne des paniers expirés |
| Commande et facture | 10 ans (obligation comptable, art. L123-22 du Code de commerce) | Conservées, y compris après la suppression du compte (le compte est anonymisé, la commande garde ses coordonnées de facturation) ; facture inaltérable (déclencheur en base) |

Droit d'accès : `GET /api/v1/me/export` inclut les commandes du compte (avec le numéro de facture). Une commande passée sans compte est retrouvée par Diani dans l'administration (recherche par e-mail).

### Paiements (phase 6, rattachés à T3)

| Rubrique | Contenu |
|---|---|
| Données | Montant, devise, moyen (Stripe ou PayPal), identifiants techniques du prestataire (session, paiement, remboursement), statuts et dates. **Aucune donnée de carte bancaire** : saisie sur les pages hébergées de Stripe ou PayPal |
| Destinataires | Stripe Payments Europe (Irlande) et PayPal (Europe) S.à r.l. et Cie, S.C.A. (Luxembourg), responsables de traitement pour leur propre part (lutte contre la fraude, obligations bancaires) |
| Événements des prestataires (`webhook_events`) | Contenu vérifié conservé **90 jours** (rejeu, enquête), puis purgé ; il peut contenir l'e-mail de la cliente |
| Paiements et remboursements | Conservés avec la commande (10 ans, pièces comptables) |

## T4 — Formations et progression (phase 7)

| Rubrique | Contenu |
|---|---|
| Finalité | Donner accès aux formations achetées, suivre la progression, corriger les quiz, délivrer les certificats, organiser les appels personnalisés |
| Base légale | Exécution du contrat (achat d'un pack) |
| Personnes concernées | Clientes et clients ayant un compte |
| Données | Accès (pack, source, dates), position de lecture, leçons terminées, réponses et scores des quiz, certificats (nom, formation, date, numéro), demandes d'appel (message, date prévue, note de l'administration) |
| Destinataires | Diani (administration) ; sous-traitants : hébergeur, Bunny.net (diffusion vidéo : IP technique de la lecture), OVH (stockage des fiches et certificats), Resend |
| Publication | Page publique de vérification d'un certificat : nom, formation et date, accessibles avec le numéro (aléatoire, non énumérable) |

| Donnée | Durée | Mécanisme |
|---|---|---|
| Progression, quiz, accès | Durée du compte | Suppression avec le compte |
| Certificats | Durée du compte | Révoqués à la suppression du compte (nom remplacé, vérification « non valide ») |
| Demandes d'appel | Durée du compte | Supprimées avec le compte |
| Copies filigranées des fiches | Durée du compte | Régénérées si la fiche change |

Droit d'accès : `GET /api/v1/me/export` inclut accès, progression, tentatives, certificats et demandes d'appel.

## T5 — Contact et newsletter (phase 8)

### Messages de contact

| Rubrique | Contenu |
|---|---|
| Finalité | Répondre aux questions et demandes envoyées par le formulaire de contact |
| Base légale | Intérêt légitime (répondre à la personne qui écrit) ; mesures précontractuelles pour une demande de devis |
| Personnes concernées | Toute personne utilisant le formulaire |
| Données | Nom, e-mail, téléphone (facultatif), sujet, message, statut et note interne de suivi |
| Destinataires | Diani (administration, par e-mail et dans le back-office) ; sous-traitants : hébergeur, Resend |

### Newsletter

| Rubrique | Contenu |
|---|---|
| Finalité | Envoyer les nouvelles des Secrets de Diani (recettes, formations, nouveautés) |
| Base légale | **Consentement** (case non pré-cochée, double opt-in), retirable à tout moment en un clic |
| Personnes concernées | Personnes inscrites par le formulaire ou par la préférence de leur compte |
| Données | E-mail, statut, origine (formulaire / compte), preuve du consentement : texte accepté, dates de demande, de confirmation et de désinscription, IP tronquées |
| Destinataires | Diani ; sous-traitants : hébergeur, Resend (confirmation), outil d'envoi des campagnes choisi par Diani (export CSV, à ajouter au registre lors du choix) |

| Donnée | Durée | Mécanisme |
|---|---|---|
| Messages de contact | 1 an après la dernière activité | Purge quotidienne (`RetentionService`) |
| Inscription jamais confirmée | 30 jours | Purge quotidienne |
| Abonnement confirmé | Jusqu'à la désinscription | — |
| Désinscrit·e (preuve du retrait) | 3 ans après la désinscription | Purge quotidienne |

Droits : `GET /api/v1/me/export` inclut l'abonnement et les messages envoyés avec l'adresse du compte ; la suppression du compte les efface. Pour une personne sans compte, effacement depuis l'administration (`DELETE /api/v1/admin/newsletter/subscribers/:id`, messages archivés puis purgés).
