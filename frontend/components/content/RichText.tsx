/**
 * Texte riche fourni par l'API (articles, pages, FAQ). Le HTML est déjà assaini côté serveur
 * (liste blanche de balises, aucun script ni attribut d'événement) : il est inséré tel quel.
 * Ne jamais passer ici un HTML d'une autre origine que l'API.
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={['prose', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
