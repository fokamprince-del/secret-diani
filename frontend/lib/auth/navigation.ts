/** Page d'arrivée après connexion quand aucune n'est demandée. */
export const DEFAULT_AFTER_LOGIN = '/espace-membre';

/**
 * Adresse de retour après connexion : uniquement un chemin interne (« /espace-membre/profil »).
 * Tout le reste (« //site-pirate.fr », « https://… », « /\pirate ») est ignoré : pas de
 * redirection ouverte vers un autre site.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return DEFAULT_AFTER_LOGIN;
  }
  try {
    const url = new URL(value, 'https://site.invalid');
    if (url.origin !== 'https://site.invalid') return DEFAULT_AFTER_LOGIN;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}
