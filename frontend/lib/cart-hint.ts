/**
 * Nombre d'articles du panier, gardé dans le navigateur pour afficher le badge de l'en-tête
 * sans interroger l'API à chaque page (le panier lui-même est sur le serveur). Ce n'est qu'un
 * indicateur : la page Panier affiche toujours l'état réel.
 */
const KEY = 'diani-panier';
const EVENT = 'diani-panier';

export function readCartCount(): number {
  try {
    const value = Number(window.localStorage.getItem(KEY) ?? 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

export function writeCartCount(count: number): void {
  try {
    if (count > 0) window.localStorage.setItem(KEY, String(count));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible : le badge n'est simplement pas affiché.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Abonnement aux changements (cet onglet et les autres). */
export function onCartCountChange(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
