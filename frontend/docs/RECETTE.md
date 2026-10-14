# Recette sur vrais téléphones

Les tests automatiques (Playwright mobile et ordinateur, axe, Lighthouse) ne remplacent pas un essai sur de vrais appareils : clavier virtuel, Safari iOS, réseau mobile, lecteur d'écran. Cette recette se fait **en préproduction**, avec l'API réelle en mode test (Stripe et PayPal « test »), avant l'ouverture au public.

## Appareils

| Appareil                                 | Navigateur              | Lecteur d'écran   |
| ---------------------------------------- | ----------------------- | ----------------- |
| iPhone récent (iOS à jour)               | Safari                  | VoiceOver         |
| iPhone plus ancien (petit écran, 375 px) | Safari                  | —                 |
| Android milieu de gamme                  | Chrome                  | TalkBack          |
| Ordinateur                               | Chrome, Firefox, Safari | NVDA ou VoiceOver |

Réseau : une partie des essais en 4G réelle (pas en Wi-Fi), et un essai en mode avion pour le bandeau hors ligne.

## Parcours à dérouler

Cocher chaque ligne ; noter appareil, navigateur et capture d'écran en cas d'écart.

### 1. Découverte (sans compte)

- [ ] Accueil : les trois univers sont identifiables en moins de 5 secondes ; aucun défilement horizontal.
- [ ] Le bouton « Découvrir nos univers » mène aux univers ; le menu s'ouvre, se ferme et rend le focus.
- [ ] Bandeau cookies : « Refuser » aussi simple qu'« Accepter » ; le choix est retenu.
- [ ] Conseils : filtre par catégorie, « Afficher plus d'articles », article avec sommaire.
- [ ] FAQ : les questions s'ouvrent au doigt et au clavier.

### 2. Traiteur

- [ ] Les prix et compositions correspondent à l'administration.
- [ ] Layer cake : la taille change le prix ; au-delà du nombre de parfums autorisé, les autres se grisent.
- [ ] « Contacter » ouvre **l'application WhatsApp** avec le message pré-rempli (iPhone et Android).
- [ ] Demande personnalisée : le sélecteur de date du téléphone s'ouvre ; une date trop proche est refusée ; l'accusé de réception affiche la référence ; l'e-mail de confirmation arrive.

### 3. Compte

- [ ] Inscription : clavier e-mail sur le champ e-mail, gestionnaire de mots de passe proposé ; e-mail de confirmation reçu, lien ouvert sur le téléphone.
- [ ] Connexion, rechargement de la page : on reste connectée ; deux onglets ouverts : déconnexion dans l'un, l'autre quitte l'espace membre.
- [ ] Mot de passe oublié de bout en bout (e-mail reçu, lien valable 30 minutes).
- [ ] Espace membre : profil, adresses, appareils connectés, export des données, suppression d'un compte de test.

### 4. Boutique (invité puis connectée)

- [ ] Ajout au panier, badge de l'en-tête, quantités, panier vide.
- [ ] Commande invitée : livraison, adresse, CGV ; redirection vers **Stripe Checkout** (carte de test `4242 4242 4242 4242`) ; Apple Pay ou Google Pay visible si l'appareil le permet ; retour « commande confirmée » ; e-mail et facture reçus.
- [ ] Paiement annulé puis repris avec **PayPal** (compte bac à sable).
- [ ] Suivi par le lien reçu par e-mail, sur un autre appareil.
- [ ] Connexion après avoir rempli un panier invité : le panier est conservé.

### 5. Formations

- [ ] Leçon offerte sans compte : la vidéo se lit **en vertical** sur le téléphone, plein écran possible.
- [ ] Achat d'un pack (paiement test) ; l'accès n'apparaît qu'après la confirmation.
- [ ] Leçon : reprise de la vidéo à la bonne seconde après avoir quitté la page ; fiche PDF ouverte sur le téléphone.
- [ ] Quiz au pouce : réponses faciles à toucher, correction claire.
- [ ] Certificat obtenu, téléchargé, page de vérification ouverte depuis le PDF.

### 6. Accessibilité

- [ ] VoiceOver (iOS) puis TalkBack (Android) : menu, formulaire de contact (erreurs annoncées), ajout au panier (confirmation annoncée), quiz.
- [ ] Zoom du texte à 200 % : rien ne se chevauche, aucune information coupée.
- [ ] Réglage « Réduire les animations » du téléphone : aucune animation d'entrée.

### 7. Performance réelle

- [ ] PageSpeed Insights (mobile) sur l'accueil, Traiteur, Formations, Boutique, **sur l'adresse de préproduction** : noter LCP, INP, CLS et le score.
- [ ] Après quelques semaines de trafic : données réelles (Core Web Vitals de la Search Console). Objectifs : LCP < 2,5 s, INP < 200 ms, CLS < 0,1.

## Écarts

Chaque écart devient un ticket (appareil, navigateur, étapes, capture). Bloquant pour l'ouverture : tout écart sur le paiement, l'accès aux formations, la protection des données ou l'accessibilité au lecteur d'écran.
