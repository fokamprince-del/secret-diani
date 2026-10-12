# Registre des traitements (RGPD / CNIL)

> Tenu à jour à chaque phase. Responsable de traitement : Les Secrets de Diani. Les procédures en cas de violation de données seront décrites dans `docs/INCIDENT.md` (phase 10).

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

## Traitements à venir

T2 Demandes traiteur (phase 4) · T3 Commandes et facturation (phases 5-6) · T4 Formations et progression (phase 7) · T5 Contact et newsletter (phase 8).
