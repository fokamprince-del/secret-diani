import { greeting, type LayoutBlock, renderLayout } from './layout';
import type { MailJob, MailTemplate, MailTemplateData, RenderedMail } from './template-data';

type Renderer<T extends MailTemplate> = (data: MailTemplateData[T]) => RenderedMail;

function mail(subject: string, title: string, blocks: LayoutBlock[]): RenderedMail {
  return { subject, ...renderLayout(title, blocks) };
}

/**
 * Désinscription en un clic (RFC 2369 et RFC 8058) : les messageries proposent un bouton
 * « Se désabonner » qui poste directement sur l'API, sans ouvrir de page.
 */
function withUnsubscribe(
  rendered: RenderedMail,
  links: { unsubscribeLink: string; oneClickUrl: string | null },
): RenderedMail {
  return {
    ...rendered,
    headers: links.oneClickUrl
      ? {
          'List-Unsubscribe': `<${links.oneClickUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : { 'List-Unsubscribe': `<${links.unsubscribeLink}>` },
  };
}

/** Gabarits versionnés avec le code (toute modification passe en revue), en français. */
const RENDERERS: { [T in MailTemplate]: Renderer<T> } = {
  'verify-email': (data) =>
    mail('Confirmez votre adresse e-mail', 'Bienvenue !', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph:
          'Merci pour votre inscription. Pour activer votre compte, confirmez votre adresse e-mail. Ce lien est valable 24 heures.',
      },
      { button: { label: 'Confirmer mon adresse e-mail', url: data.link } },
      {
        paragraph:
          'Si vous n’êtes pas à l’origine de cette inscription, ignorez simplement cet e-mail.',
      },
    ]),

  welcome: (data) =>
    mail('Votre compte est activé', 'Votre compte est activé', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph:
          'Votre adresse e-mail est confirmée. Vous pouvez dès maintenant découvrir nos formations, nos kits et notre service traiteur.',
      },
      { button: { label: 'Découvrir nos univers', url: data.siteLink } },
    ]),

  'account-exists': (data) =>
    mail('Tentative d’inscription avec votre adresse', 'Vous avez déjà un compte', [
      { paragraph: 'Bonjour,' },
      {
        paragraph:
          'Quelqu’un (vous, probablement) a essayé de créer un compte avec cette adresse e-mail, mais un compte existe déjà.',
      },
      { button: { label: 'Me connecter', url: data.loginLink } },
      { paragraph: 'Mot de passe oublié ? Vous pouvez le réinitialiser :' },
      { button: { label: 'Réinitialiser mon mot de passe', url: data.resetLink } },
      { paragraph: 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.' },
    ]),

  'password-reset': (data) =>
    mail(
      `${data.code} : votre code pour réinitialiser votre mot de passe`,
      'Réinitialiser votre mot de passe',
      [
        { paragraph: greeting(data.firstName) },
        {
          paragraph:
            'Vous avez demandé à réinitialiser votre mot de passe. Saisissez ce code sur la page « Mot de passe oublié » :',
        },
        {
          code: {
            value: data.code,
            caption: `Votre code · valable ${data.codeExpiresInMinutes} minutes`,
          },
        },
        {
          paragraph: `Ou, plus simple depuis cet appareil, utilisez directement le bouton ci-dessous (lien valable ${data.expiresInMinutes} minutes, utilisable une seule fois).`,
        },
        { button: { label: 'Choisir un nouveau mot de passe', url: data.link } },
        {
          paragraph:
            'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.',
        },
      ],
    ),

  'password-changed': (data) =>
    mail('Votre mot de passe a été modifié', 'Mot de passe modifié', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph:
          'Le mot de passe de votre compte vient d’être modifié. Par sécurité, vos autres appareils ont été déconnectés.',
      },
      {
        paragraph:
          'Si vous n’êtes pas à l’origine de ce changement, réinitialisez immédiatement votre mot de passe et contactez-nous.',
      },
      { button: { label: 'Réinitialiser mon mot de passe', url: data.resetLink } },
    ]),

  'email-change-confirm': (data) =>
    mail('Confirmez votre nouvelle adresse e-mail', 'Confirmez votre nouvelle adresse', [
      { paragraph: 'Bonjour,' },
      {
        paragraph: `Pour utiliser cette adresse sur votre compte Les Secrets de Diani, confirmez-la. Ce lien est valable ${data.expiresInMinutes} minutes.`,
      },
      { button: { label: 'Confirmer ma nouvelle adresse', url: data.link } },
      { paragraph: 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.' },
    ]),

  'email-change-notice': (data) =>
    mail('Changement d’adresse e-mail demandé', 'Changement d’adresse e-mail', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph:
          'Un changement d’adresse e-mail a été demandé sur votre compte. Il ne sera effectif qu’après confirmation depuis la nouvelle adresse.',
      },
      {
        paragraph:
          'Si vous n’êtes pas à l’origine de cette demande, changez votre mot de passe et contactez-nous.',
      },
    ]),

  'admin-login-alert': (data) =>
    mail('Alerte de sécurité : nouvelle connexion administrateur', 'Nouvelle connexion', [
      { paragraph: 'Bonjour,' },
      { paragraph: `Une connexion à l’espace d’administration a eu lieu le ${data.at}.` },
      {
        paragraph: `Réseau : ${data.ipTruncated ?? 'inconnu'} — Appareil : ${data.userAgent ?? 'inconnu'}`,
      },
      {
        paragraph:
          'Si ce n’était pas vous, déconnectez toutes les sessions et changez votre mot de passe immédiatement.',
      },
    ]),

  'account-security-changed': (data) => {
    const texts = {
      locked: [
        'Votre compte a été suspendu',
        'Votre compte a été suspendu par l’équipe des Secrets de Diani : la connexion n’est plus possible pour le moment.',
      ],
      unlocked: [
        'Votre compte est de nouveau actif',
        'Votre compte a été réactivé : vous pouvez de nouveau vous connecter.',
      ],
      mfa_reset: [
        'Double authentification réinitialisée',
        'La double authentification de votre compte a été réinitialisée : vous la configurerez de nouveau à votre prochaine connexion. Vous avez été déconnecté·e de tous vos appareils.',
      ],
      sessions_revoked: [
        'Vous avez été déconnecté·e',
        'Par sécurité, vous avez été déconnecté·e de tous vos appareils. Reconnectez-vous avec votre mot de passe.',
      ],
    } as const;
    const [title, text] = texts[data.change];
    return mail(title, title, [
      { paragraph: greeting(data.firstName) },
      { paragraph: text },
      { paragraph: 'Une question, ou ce n’est pas normal ? Répondez simplement à cet e-mail.' },
    ]);
  },

  'account-deleted': (data) =>
    mail('Votre compte a été supprimé', 'Compte supprimé', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph:
          'Votre compte et vos données personnelles ont été supprimés. Les factures éventuelles sont conservées pendant la durée légale (10 ans), sans autre usage.',
      },
      { paragraph: 'Merci pour votre confiance, et à bientôt peut-être.' },
    ]),

  'catering-request-received': (data) =>
    mail(`Votre demande ${data.reference} est bien reçue`, 'Demande bien reçue', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph: `Merci pour votre demande pour le ${data.eventDate}. Diani la lit personnellement et vous recontacte rapidement pour en convenir les détails.`,
      },
      ...(data.itemLines.length > 0
        ? [
            { paragraph: 'Votre sélection :' },
            ...data.itemLines.map((line) => ({ paragraph: line })),
          ]
        : []),
      ...(data.estimatedTotal
        ? [
            {
              paragraph: `Total estimé : ${data.estimatedTotal} (confirmé avec vous avant toute commande).`,
            },
          ]
        : []),
      { paragraph: 'Pour rappel, nos conditions :' },
      ...data.conditions.map((condition) => ({ paragraph: `– ${condition}` })),
      { paragraph: `Référence de votre demande : ${data.reference}.` },
    ]),

  'catering-request-admin': (data) =>
    mail(`Nouvelle demande traiteur ${data.reference}`, 'Nouvelle demande traiteur', [
      { paragraph: `${data.reference} (${data.source})` },
      { paragraph: `Cliente : ${data.customerName}` },
      { paragraph: `E-mail : ${data.email}${data.phone ? ` — Téléphone : ${data.phone}` : ''}` },
      {
        paragraph: `Date : ${data.eventDate}${data.guestCount ? ` — ${data.guestCount} invités` : ''}${data.fulfilment ? ` — ${data.fulfilment}` : ''}`,
      },
      ...data.itemLines.map((line) => ({ paragraph: line })),
      ...(data.estimatedTotal ? [{ paragraph: `Total estimé : ${data.estimatedTotal}` }] : []),
      ...(data.message ? [{ paragraph: `Message : ${data.message}` }] : []),
      { paragraph: 'La demande est visible dans l’administration (Traiteur → Demandes).' },
    ]),

  'catering-order-confirmed': (data) =>
    mail(`Votre commande ${data.reference} est confirmée`, 'Commande confirmée', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph: `Votre acompte de ${data.deposit} est bien reçu : votre commande pour le ${data.eventDate} est confirmée.`,
      },
      {
        paragraph: `Total : ${data.total} — solde à régler au retrait ou à la livraison : ${data.balance}.`,
      },
      { paragraph: 'Pour rappel, nos conditions :' },
      ...data.conditions.map((condition) => ({ paragraph: `– ${condition}` })),
      {
        paragraph: `Référence de votre commande : ${data.reference}. Merci pour votre confiance !`,
      },
    ]),

  'order-confirmed': (data) => {
    const course = !!data.coursesLink;
    return mail(
      course
        ? `Bienvenue dans votre formation · commande ${data.reference}`
        : `Votre commande ${data.reference} est confirmée`,
      course ? 'Bienvenue dans votre formation !' : 'Merci pour votre commande !',
      [
        { paragraph: greeting(data.firstName) },
        {
          paragraph: course
            ? 'Votre paiement est bien reçu et votre accès est ouvert : vous pouvez commencer dès maintenant, à votre rythme.'
            : 'Votre paiement est bien reçu : je prépare votre commande avec soin.',
        },
        ...(data.coursesLink
          ? [{ button: { label: 'Commencer ma formation', url: data.coursesLink } }]
          : []),
        { paragraph: `Récapitulatif de la commande ${data.reference} :` },
        {
          rows: [
            ...data.items.map((item) => ({ label: item.label, value: item.amount })),
            ...(course ? [] : [{ label: 'Sous-total', value: data.subtotal }]),
            ...(course ? [] : [{ label: 'Livraison', value: data.shipping }]),
            { label: 'Total payé', value: data.total, total: true },
          ],
        },
        ...(course ? [] : [{ paragraph: data.deliveryLine }]),
        {
          note: data.invoiceAttached
            ? 'Votre facture est jointe à cet e-mail (PDF). Elle reste aussi disponible depuis le suivi de votre commande.'
            : 'Votre facture est disponible depuis le suivi de votre commande.',
        },
        { button: { label: 'Suivre ma commande', url: data.trackingLink } },
      ],
    );
  },

  'order-shipped': (data) =>
    mail(`Votre commande ${data.reference} est en route`, 'Votre commande est expédiée', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph: data.trackingNumber
          ? `Votre commande a été remise au transporteur${data.carrier ? ` (${data.carrier})` : ''}. Numéro de suivi : ${data.trackingNumber}.`
          : `Votre commande a été remise au transporteur${data.carrier ? ` (${data.carrier})` : ''}.`,
      },
      { button: { label: 'Suivre ma commande', url: data.trackingLink } },
    ]),

  'stock-low': (data) =>
    mail('Alerte : stock bas en boutique', 'Stock bas', [
      { paragraph: 'Ces articles sont passés sous leur seuil d’alerte :' },
      ...data.lines.map((line) => ({ paragraph: `– ${line}` })),
      { paragraph: 'Pensez au réassort depuis l’administration (Boutique → Stock).' },
    ]),

  'order-refunded': (data) =>
    mail(`Remboursement de votre commande ${data.reference}`, 'Remboursement effectué', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph: data.full
          ? `Votre commande ${data.reference} a été intégralement remboursée (${data.amount}).`
          : `Un remboursement de ${data.amount} a été effectué sur votre commande ${data.reference}.`,
      },
      { paragraph: `Motif : ${data.reason}` },
      {
        paragraph:
          'Le montant apparaîtra sur votre compte sous quelques jours ouvrés, selon votre banque ou PayPal.',
      },
      { button: { label: 'Voir ma commande', url: data.trackingLink } },
    ]),

  'course-access-granted': (data) =>
    mail(`Bienvenue dans le pack ${data.packName}`, 'Vos formations vous attendent', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph: `Votre accès au pack ${data.packName} est ouvert : toutes les formations qu’il comprend sont disponibles dans votre espace membre.`,
      },
      { button: { label: 'Commencer ma formation', url: data.link } },
    ]),

  'course-completed': (data) =>
    mail(`Formation terminée : ${data.courseTitle}`, 'Bravo, formation terminée !', [
      { paragraph: greeting(data.firstName) },
      { paragraph: `Vous avez terminé la formation « ${data.courseTitle} ». Félicitations !` },
      {
        paragraph: data.certificateNumber
          ? `Votre certificat n° ${data.certificateNumber} est disponible dans votre espace membre.`
          : 'Pour recevoir votre certificat, complétez votre prénom et votre nom dans votre profil, puis demandez-le depuis la formation.',
      },
      {
        button: {
          label: data.certificateNumber ? 'Voir mon certificat' : 'Compléter mon profil',
          url: data.link,
        },
      },
    ]),

  'call-request-admin': (data) =>
    mail('Nouvelle demande d’appel personnalisé', 'Demande d’appel personnalisé', [
      { paragraph: `${data.customerName} (${data.email}) demande un appel personnalisé.` },
      { paragraph: `Message : ${data.message}` },
      { paragraph: `Appels restants après cette demande : ${data.remaining}.` },
      { paragraph: 'La demande est visible dans l’administration (Formations → Appels).' },
    ]),

  'contact-admin': (data) => ({
    ...mail(`Nouveau message : ${data.subject}`, 'Nouveau message depuis le site', [
      { paragraph: `De : ${data.name} (${data.email}${data.phone ? `, ${data.phone}` : ''})` },
      { paragraph: `Sujet : ${data.subject}` },
      ...data.message.split(/\n+/).map((line) => ({ paragraph: line })),
      { paragraph: 'Répondez directement à cet e-mail pour lui écrire.' },
    ]),
    replyTo: data.email,
  }),

  'contact-ack': (data) =>
    mail('Nous avons bien reçu votre message', 'Message bien reçu', [
      { paragraph: `Bonjour ${data.name},` },
      {
        paragraph: `Merci pour votre message (${data.subject}). Diani vous répond personnellement dans les meilleurs délais.`,
      },
    ]),

  'newsletter-confirm': (data) =>
    withUnsubscribe(
      mail('Confirmez votre inscription à la newsletter', 'Une dernière étape', [
        { paragraph: 'Bonjour,' },
        {
          paragraph:
            'Vous avez demandé à recevoir les nouvelles des Secrets de Diani (recettes, formations, nouveautés). Confirmez votre inscription : ce lien est valable 7 jours.',
        },
        { button: { label: 'Confirmer mon inscription', url: data.confirmLink } },
        {
          paragraph:
            'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : vous ne serez pas inscrit·e.',
        },
        { paragraph: 'Vous pourrez vous désinscrire à tout moment, en un clic :' },
        { button: { label: 'Me désinscrire', url: data.unsubscribeLink } },
      ]),
      data,
    ),

  'newsletter-welcome': (data) =>
    withUnsubscribe(
      mail('Bienvenue dans la newsletter', 'Inscription confirmée', [
        { paragraph: 'Bonjour,' },
        {
          paragraph:
            'Votre inscription est confirmée : à très vite pour les prochaines nouveautés !',
        },
        { paragraph: 'Vous pouvez vous désinscrire à tout moment, en un clic :' },
        { button: { label: 'Me désinscrire', url: data.unsubscribeLink } },
      ]),
      data,
    ),

  'payment-alert': (data) =>
    mail(`Paiements : ${data.title}`, data.title, [
      ...data.lines.map((line) => ({ paragraph: line })),
      {
        paragraph:
          'Détail dans l’administration (Boutique → Commandes) et le tableau de bord du prestataire.',
      },
    ]),
};

export function renderMail(job: Pick<MailJob, 'template' | 'data'>): RenderedMail {
  // Corrélation gabarit ↔ données garantie par le type MailJob (union discriminée).
  const renderer = RENDERERS[job.template] as (data: MailJob['data']) => RenderedMail;
  return renderer(job.data);
}
