import type { Metadata } from 'next';
import Link from 'next/link';
import { RichText } from '@/components/content/RichText';
import { AddToCart } from '@/components/shop/AddToCart';
import { AvailabilityBadge } from '@/components/shop/AvailabilityBadge';
import { ButtonLink } from '@/components/ui/Button';
import { JsonLd } from '@/components/ui/JsonLd';
import { ResponsiveImage } from '@/components/ui/ResponsiveImage';
import { ErrorState } from '@/components/ui/States';
import { getShopProduct, getShopProducts, getSiteSettings } from '@/lib/api/content';
import { pageMetadata } from '@/lib/seo';
import styles from './page.module.css';

type Params = Promise<{ slug: string }>;

export const dynamicParams = true;

export async function generateStaticParams() {
  const products = await getShopProducts();
  return (products ?? []).map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await getShopProduct((await params).slug);
  if (!product) return { title: 'Produit momentanément indisponible' };
  const image = product.image ?? product.gallery[0];
  return pageMetadata({
    title: product.seo.title,
    description: product.seo.description,
    path: `/boutique/${product.slug}`,
    image: image
      ? { url: image.url, width: image.width, height: image.height, alt: image.alt }
      : null,
  });
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [product, settings] = await Promise.all([getShopProduct(slug), getSiteSettings()]);

  if (!product) {
    return (
      <div className="conteneur">
        <ErrorState
          title="Ce produit est momentanément indisponible"
          headingLevel={1}
          action={<ButtonLink href="/boutique">Voir la boutique</ButtonLink>}
        >
          <p>Il sera de retour dans quelques minutes.</p>
        </ErrorState>
      </div>
    );
  }

  const gallery =
    product.gallery.length > 0 ? product.gallery : product.image ? [product.image] : [];

  return (
    <>
      <JsonLd data={product.jsonLd} />
      <div className={`conteneur ${styles.fiche}`}>
        <nav aria-label="Fil d’Ariane" className={styles.ariane}>
          <ol role="list">
            <li>
              <Link href="/boutique">Boutique</Link>
            </li>
            <li aria-current="page">{product.name}</li>
          </ol>
        </nav>

        <div className={styles.visuels}>
          {gallery.length > 0 ? (
            <ul role="list" className={styles.galerie}>
              {gallery.map((image, index) => (
                <li key={image.url}>
                  <ResponsiveImage
                    image={image}
                    sizes="(min-width: 64rem) 560px, 100vw"
                    aspectRatio="1 / 1"
                    priority={index === 0}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.aplat} aria-hidden="true" />
          )}
        </div>

        <div className={styles.infos}>
          <h1 className={styles.titre}>{product.name}</h1>
          {product.shortDescription && (
            <p className={styles.accroche}>{product.shortDescription}</p>
          )}
          <AvailabilityBadge availability={product.availability} />
          <AddToCart
            productName={product.name}
            variants={product.variants}
            shopOpen={settings?.features.shopOpen ?? true}
          />
        </div>

        <div className={styles.details}>
          {product.composition.length > 0 && (
            <section aria-labelledby="composition-titre" className={styles.bloc}>
              <h2 id="composition-titre">Dans ce kit</h2>
              <ul className={styles.composition}>
                {product.composition.map((item) => (
                  <li key={item.label}>
                    <span className={styles.quantite}>× {item.quantity}</span> {item.label}
                    {item.details && <span className={styles.precision}> ({item.details})</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {product.descriptionHtml && (
            <section aria-labelledby="description-titre" className={styles.bloc}>
              <h2 id="description-titre">Description</h2>
              <RichText html={product.descriptionHtml} />
            </section>
          )}
          {product.kind === 'kit' && (
            <p>
              Vous hésitez entre deux kits ?{' '}
              <Link href="/boutique#comparer-titre">Comparez-les</Link>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
