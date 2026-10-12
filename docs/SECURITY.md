# Sécurité

> Document construit au fil des phases. Version actuelle : socle (phase 1) et authentification / comptes (phase 2). La revue complète (OWASP ASVS niveau 2 sur tout le périmètre, scan de l'image, test de charge) a lieu en phase 10.

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

`FIELD_ENCRYPTION_KEY` n'est jamais dans la base ni dans ses sauvegardes : perdre cette clé rend les secrets 2FA illisibles (les administrateurs devront alors refaire leur enrôlement).
