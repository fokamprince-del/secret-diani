import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';

/** Espaces privés et tunnel de commande exclus de l'indexation. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/espace-membre',
        '/panier',
        '/commande/',
        '/connexion',
        '/inscription',
        '/mot-de-passe-oublie',
        '/reinitialiser',
        '/verifier-email',
      ],
    },
    sitemap: siteUrl('/sitemap.xml'),
  };
}
