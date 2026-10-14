import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArticleCategories, SLUG_PATTERN } from '@/lib/api/content';
import { pageMetadata } from '@/lib/seo';
import { ConseilsIndex } from '../../ConseilsIndex';

type Params = Promise<{ categorie: string }>;

export const dynamicParams = true;

export async function generateStaticParams() {
  const categories = await getArticleCategories();
  return (categories ?? []).map((category) => ({ categorie: category.slug }));
}

async function findCategory(slug: string) {
  if (!SLUG_PATTERN.test(slug)) notFound();
  const categories = await getArticleCategories();
  const category = categories?.find((entry) => entry.slug === slug);
  if (!category) notFound();
  return category;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const category = await findCategory((await params).categorie);
  return pageMetadata({
    title: `${category.name} · Conseils & astuces`,
    description:
      category.description ||
      `Les conseils de Diani en ${category.name.toLowerCase()} : techniques, astuces et erreurs à éviter.`,
    path: `/conseils/categorie/${category.slug}`,
  });
}

export default async function CategoryPage({ params }: { params: Params }) {
  const category = await findCategory((await params).categorie);
  return <ConseilsIndex category={category} />;
}
