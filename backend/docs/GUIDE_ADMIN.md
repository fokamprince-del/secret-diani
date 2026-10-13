# Guide de l'administration — Les Secrets de Diani

Ce guide explique ce que vous pouvez faire vous-même depuis l'espace d'administration, sans développeur. Les écrans arrivent avec le back-office du site. Les noms entre parenthèses (`site.announcement`…) servent seulement à l'équipe technique si vous avez besoin d'aide.

## Se connecter

- Adresse e-mail, mot de passe, puis le code à 6 chiffres de votre application d'authentification (Google Authenticator, Microsoft Authenticator…).
- Gardez vos **10 codes de secours** hors ligne (papier, coffre-fort de mots de passe). Chaque code sert une fois, si votre téléphone n'est pas à portée de main.
- Téléphone perdu : un autre administrateur réinitialise votre double authentification depuis votre fiche. Vous la configurez à nouveau à la connexion suivante.
- À chaque connexion à l'administration, un e-mail d'alerte vous est envoyé. Si ce n'était pas vous, changez votre mot de passe tout de suite.

## Tableau de bord

Il affiche, sur la période choisie (7, 30, 90 jours…) :
- les **ventes** : boutique et formations, remboursements déduits, avec la courbe jour par jour ;
- les **choses à faire** : commandes à expédier, demandes traiteur à traiter, événements des 14 prochains jours, messages de contact non lus, appels personnalisés à planifier ;
- les **stocks bas** : les articles dont il reste peu d'exemplaires (seuil réglable sur chaque article) ;
- les nouvelles clientes et les inscriptions à la newsletter.

## Modifier le site sans développeur

| Je veux… | Où |
|---|---|
| Changer un texte, une photo, une page (À propos, CGV…) ou la FAQ | Contenus › Pages, Articles, FAQ |
| Changer un prix ou une photo du traiteur ou de la boutique | Traiteur › Produits ; Boutique › Produits |
| Changer le montant des acomptes traiteur ou le seuil des 50 € | Paramètres › Traiteur |
| Modifier les conditions de commande traiteur | Paramètres › Traiteur › Conditions (une phrase par ligne) |
| Afficher un bandeau (promotion, fermeture exceptionnelle) | Paramètres › Site › Bandeau d'annonce |
| Fermer la boutique pendant les vacances | Paramètres › Fonctionnalités › Boutique ouverte : non |
| Suspendre la vente des formations | Paramètres › Fonctionnalités › Achat des packs : non |
| Changer le numéro WhatsApp, l'e-mail de contact, les réseaux sociaux | Paramètres › Site |
| Compléter les mentions des factures (SIRET, adresse, TVA) | Paramètres › Mentions légales |
| Changer le prix ou le contenu d'un pack de formation | Formations › Packs |

Chaque paramètre a un bouton **« Revenir à la valeur par défaut »**. Une valeur incorrecte est refusée avec un message qui explique quoi corriger. Les modifications sont visibles sur le site en quelques secondes.

Les **commandes déjà passées** ne changent pas quand vous modifiez un prix : elles gardent le prix payé.

## Clientes et comptes

Depuis la fiche d'une cliente (recherche par e-mail, prénom ou nom) :
- **Suspendre** le compte : la cliente est déconnectée partout et ne peut plus se connecter. Elle est prévenue par e-mail. **Réactiver** annule la suspension.
- **Déconnecter de tous les appareils** : utile si elle pense qu'on a utilisé son compte.
- **Offrir un accès à une formation** : Formations › Accès (avec une note, par exemple « cadeau anniversaire »).
- **Exporter ses données** : si elle vous les demande par e-mail ou par courrier, après avoir vérifié que c'est bien elle. Vous avez un mois pour répondre.
- Pour supprimer son compte, la cliente le fait elle-même depuis son espace (avec son mot de passe), ou vous écrit et l'équipe technique s'en charge.

Vous ne pouvez pas agir ainsi sur votre propre compte (passez par « Mon compte »), ni nommer un autre administrateur : cela se fait sur le serveur, par l'équipe technique.

## Messages et newsletter

- Les **messages de contact** arrivent dans votre boîte e-mail : « Répondre » écrit directement à la personne. Dans l'administration, marquez-les « répondu » ou « archivé ».
- **Newsletter** : seules les personnes qui ont confirmé leur inscription par e-mail sont dans la liste. Avant chaque envoi, exportez la liste (fichier CSV) et importez-la dans votre outil d'envoi. N'utilisez jamais une ancienne liste : elle contiendrait des personnes désinscrites depuis.

## Journal d'activité

Toutes les actions sensibles (modification d'un prix ou d'un paramètre, suspension d'un compte, remboursement, export…) sont enregistrées avec la date et l'administrateur qui les a faites. Ce journal ne peut pas être modifié. Vous pouvez le consulter, par exemple pour retrouver l'historique d'une commande ou d'un compte.

## En cas de doute

Ne supprimez rien dans l'urgence. Suspendez plutôt (un compte), dépubliez (une page, un produit) ou fermez temporairement (la boutique), puis contactez l'équipe technique.
