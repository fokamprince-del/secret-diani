import { greeting, type LayoutBlock, renderLayout } from './layout';
import type { MailJob, MailTemplate, MailTemplateData, RenderedMail } from './template-data';

type Renderer<T extends MailTemplate> = (data: MailTemplateData[T]) => RenderedMail;

function mail(subject: string, title: string, blocks: LayoutBlock[]): RenderedMail {
  return { subject, ...renderLayout(title, blocks) };
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
    mail('Réinitialisation de votre mot de passe', 'Réinitialiser votre mot de passe', [
      { paragraph: greeting(data.firstName) },
      {
        paragraph: `Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable ${data.expiresInMinutes} minutes et ne peut servir qu’une fois.`,
      },
      { button: { label: 'Choisir un nouveau mot de passe', url: data.link } },
      {
        paragraph:
          'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.',
      },
    ]),

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

  'order-confirmed': (data) =>
    mail(`Votre commande ${data.reference} est confirmée`, 'Merci pour votre commande !', [
      { paragraph: greeting(data.firstName) },
      { paragraph: 'Votre paiement est bien reçu : nous préparons votre commande avec soin.' },
      ...data.itemLines.map((line) => ({ paragraph: line })),
      { paragraph: `Sous-total : ${data.subtotal} — Livraison : ${data.shipping}` },
      { paragraph: `Total payé : ${data.total}` },
      { paragraph: data.deliveryLine },
      { paragraph: 'Votre facture est disponible depuis le suivi de votre commande.' },
      { button: { label: 'Suivre ma commande', url: data.trackingLink } },
    ]),

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
};

export function renderMail(job: Pick<MailJob, 'template' | 'data'>): RenderedMail {
  // Corrélation gabarit ↔ données garantie par le type MailJob (union discriminée).
  const renderer = RENDERERS[job.template] as (data: MailJob['data']) => RenderedMail;
  return renderer(job.data);
}
