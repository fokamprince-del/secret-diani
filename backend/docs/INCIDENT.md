# Procédure en cas de violation de données (RGPD art. 33 et 34)

> Une **violation de données personnelles** est tout incident de sécurité, malveillant ou accidentel, qui entraîne la destruction, la perte, l'altération, la divulgation ou l'accès non autorisé à des données personnelles. Exemples : copie de la base, sauvegarde lisible par un tiers, compte administrateur détourné, e-mail envoyé au mauvais destinataire, fichier privé rendu public.
>
> **Délai légal : la CNIL doit être notifiée dans les 72 heures** suivant la prise de connaissance de la violation, sauf si elle est improbable d'engendrer un risque pour les personnes. Le compteur démarre dès qu'il existe une certitude raisonnable qu'une violation a eu lieu, pas à la fin de l'enquête.

## 1. Contacts

À compléter et à tenir à jour avant la mise en production (phase 10).

| Rôle | Personne | Joignable |
|---|---|---|
| Responsable de traitement (décide et notifie) | Diani — Les Secrets de Diani | _à compléter_ |
| Référent technique (contient et enquête) | _à compléter_ | _à compléter_ |
| Hébergeur VPS et stockage objets (OVH) | Support OVHcloud | espace client OVH |
| Envoi des e-mails (Resend) | Support Resend | tableau de bord Resend |
| Autorité de contrôle | CNIL | téléservice de notification : <https://notifications.cnil.fr/notifications/index> |

## 2. Déroulé

| Échéance | Étape | Qui |
|---|---|---|
| H+0 | **Détecter et consigner** : ouvrir une fiche dans le registre (§5), noter l'heure de prise de connaissance et la source (Sentry, alerte de connexion admin, signalement, journaux) | Celui qui détecte |
| H+0 → H+4 | **Contenir** (§3) : couper l'accès de l'attaquant sans détruire les preuves | Référent technique |
| H+4 → H+24 | **Évaluer** : quelles données, combien de personnes, depuis quand, données chiffrées ou non, conséquences possibles (§4) | Référent technique + responsable |
| ≤ H+72 | **Notifier la CNIL** si un risque existe. Si l'enquête n'est pas finie, notifier quand même (notification initiale), puis compléter | Responsable de traitement |
| Sans délai | **Informer les personnes concernées** si le risque est **élevé** (§4) | Responsable de traitement |
| Ensuite | **Corriger** la cause, ajouter un test qui reproduit l'attaque, mettre à jour `SECURITY.md` et ce document | Référent technique |

### Préserver les preuves avant toute correction

- Exporter les journaux des conteneurs : `docker compose -f docker-compose.prod.yml logs --since 72h --no-color api worker traefik > incident-<date>.log`.
- Exporter le journal d'audit de la période (immuable en base, conservé 1 an) : `GET /api/v1/admin/audit-logs`, ou en SQL `\copy (SELECT * FROM audit_logs WHERE created_at > now() - interval '7 days') TO 'audit-incident.csv' CSV HEADER`.
- Conserver l'événement Sentry correspondant et la sauvegarde chiffrée la plus proche **avant** l'incident (ne pas la laisser expirer : prolonger sa rétention dans le bucket).
- Stocker ces fichiers hors du serveur compromis, chiffrés (`age`, même clé publique que les sauvegardes).

## 3. Mesures de confinement selon le scénario

| Scénario | Actions immédiates |
|---|---|
| **Compte administrateur détourné** | 1. Révoquer toutes ses sessions (SQL ci-dessous, filtré sur son `user_id`). 2. Réinitialiser son 2FA (RUNBOOK › « Administrateur ayant perdu son téléphone »). 3. Changer son mot de passe. 4. Relire ses actions dans le journal d'audit (filtre `actorId`). |
| **Jetons volés / session détournée à grande échelle** | Révoquer **toutes** les sessions, puis changer `JWT_ACCESS_SECRET` **sans période de transition** (RUNBOOK › Rotation des secrets) : jetons d'accès et refresh tokens deviennent inutilisables, chacun doit se reconnecter. |
| **Copie de la base ou d'une sauvegarde** | Évaluer ce qui est lisible : mots de passe en Argon2id (non réversibles), secrets 2FA chiffrés avec `FIELD_ENCRYPTION_KEY` (hors base), sauvegardes chiffrées avec `age`. Si `FIELD_ENCRYPTION_KEY` a pu fuiter aussi : rotation (RUNBOOK) et réenrôlement 2FA des administrateurs. Révoquer toutes les sessions. Recommander aux clientes de changer leur mot de passe s'il est réutilisé ailleurs. |
| **Secret d'infrastructure exposé** (clé Resend, clés S3, mot de passe Postgres, clé de déploiement) | Révoquer la clé chez le prestataire, en émettre une nouvelle, mettre à jour `.env.production` (chmod 600), redéployer. Vérifier dans le tableau de bord du prestataire ce qui a été fait avec l'ancienne clé. |
| **Fichier privé exposé** (bucket privé lisible, URL signée diffusée) | Les URL signées expirent après 5 minutes. Vérifier la politique du bucket privé (aucun accès public), supprimer ou déplacer l'objet si nécessaire, consulter les journaux d'accès du stockage objets. |
| **E-mail envoyé au mauvais destinataire** | Identifier les messages concernés (tableau de bord Resend), demander la suppression au destinataire, corriger le gabarit ou la donnée en cause. |

Révoquer toutes les sessions (ou celles d'un compte, en ajoutant `AND user_id = '…'`) :

```sql
UPDATE sessions SET revoked_at = now(), revoked_reason = 'incident'
WHERE revoked_at IS NULL;
```

Les refresh tokens de ces sessions deviennent inutilisables immédiatement. Les jetons d'accès déjà émis restent valables 15 minutes au plus (10 minutes pour un administrateur), sauf si `JWT_ACCESS_SECRET` est changé en même temps.

## 4. Évaluer le risque pour les personnes

| Niveau | Exemples | Obligations |
|---|---|---|
| Improbable | Données chiffrées dont la clé n'a pas fuité ; sauvegarde `age` copiée sans la clé privée ; accès bloqué avant toute lecture | Registre interne seulement (§5), avec la justification |
| Risque | Adresses e-mail, noms, adresses postales, historique de commandes lisibles | Registre + **notification CNIL ≤ 72 h** |
| Risque élevé | Données permettant une usurpation ou une fraude (identifiants réutilisables, données de paiement — **jamais stockées par l'API**, voir le cahier des charges §5.5), volume important, personnes vulnérables | Registre + CNIL + **information des personnes** en termes clairs : nature de la violation, conséquences probables, mesures prises, conseils (changer de mot de passe, se méfier des e-mails frauduleux), contact |

L'information des personnes peut partir par e-mail via l'outil d'envoi habituel, avec un texte validé par le responsable de traitement.

## 5. Registre des violations

**Toute** violation est inscrite au registre, même si elle n'est pas notifiée (art. 33.5). Le registre est tenu hors du serveur de production, avec ces rubriques :

| Rubrique | Contenu |
|---|---|
| Identifiant et dates | Survenue (estimée), prise de connaissance, confinement, notification CNIL (numéro de dossier), information des personnes |
| Nature | Confidentialité, intégrité et/ou disponibilité |
| Données et personnes | Catégories de données, nombre approximatif de personnes et d'enregistrements |
| Cause | Origine technique ou humaine, vecteur d'attaque |
| Conséquences | Probables pour les personnes |
| Mesures | Confinement, correction, test ajouté (lien vers la demande de fusion) |
| Décision de notification | Notifiée ou non, avec la justification |

## 6. Après l'incident

- Rédiger un retour d'expérience (chronologie, cause, ce qui a bien ou mal fonctionné) sous 15 jours.
- Ajouter au minimum un test automatisé qui reproduit le vecteur d'attaque (un test qui échoue avant la correction, passe après).
- Mettre à jour `SECURITY.md` (modèle de menaces), `RUNBOOK.md` et ce document.
- Exercice à blanc de cette procédure une fois par an (simuler la fuite d'une clé et chronométrer le confinement).
