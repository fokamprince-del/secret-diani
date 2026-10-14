import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { RichText } from '@/components/content/RichText';
import { TableOfContents } from '@/components/content/TableOfContents';
import { ButtonLink } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { getPage, getPageLinks } from '@/lib/api/content';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

type Params = Promise<{ page: string }>;

/**
 * Pages éditoriales de l'API servies à la racine (« /a-propos », « /cgv »…), comme dans le plan
 * du site de l'API. Une page créée dans l'administration est publiée sans redéploiement :
 * les adresses inconnues au build sont rendues à la demande puis mises en cache.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  const links = await getPageLinks();
  return (links ?? []).map((link) => ({ page: link.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { page: slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: 'Page momentanément indisponible' };
  return pageMetadata({
    title: page.seo.title,
    description: page.seo.description,
    path: `/${page.slug}`,
  });
}

export default async function StaticPage({ params }: { params: Params }) {
  const { page: slug } = await params;
  const page = await getPage(slug);

  if (!page) {
    return (
      <div className="conteneur">
        <ErrorState
          title="Cette page est momentanément indisponible"
          headingLevel={1}
          action={<ButtonLink href="/">Revenir à l’accueil</ButtonLink>}
        >
          <p>Elle sera de retour dans quelques minutes. Merci de votre patience.</p>
        </ErrorState>
      </div>
    );
  }

  const isAbout = page.slug === 'a-propos';
  return (
    <article>
      <PageHeader
        title={page.title}
        meta={isAbout ? undefined : `Mis à jour le ${formatDate(page.updatedAt)}`}
      />
      <div className={`conteneur ${styles.corps}`}>
        <TableOfContents entries={page.toc} />
        <RichText html={page.bodyHtml} />
      </div>
      {isAbout && (
        <aside aria-labelledby="suite-titre" className={`conteneur ${styles.suite}`}>
          <h2 id="suite-titre" className={styles.suiteTitre}>
            Envie de goûter, d’apprendre ou de vous équiper ?
          </h2>
          <div className={styles.actions}>
            <ButtonLink href="/#univers" withArrow>
              Découvrir nos univers
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondaire">
              Écrire à Diani
            </ButtonLink>
          </div>
        </aside>
      )}
    </article>
  );
}
