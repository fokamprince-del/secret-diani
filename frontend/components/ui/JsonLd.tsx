/**
 * Données structurées schema.org. Le type `application/ld+json` n'est pas exécuté :
 * la CSP n'a pas à l'autoriser. `<` est échappé pour qu'aucun contenu ne ferme la balise.
 */
export function JsonLd({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
