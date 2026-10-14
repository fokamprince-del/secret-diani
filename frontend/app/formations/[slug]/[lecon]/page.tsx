import type { Metadata } from 'next';
import { LessonView } from '@/components/courses/LessonView';
import { privateMetadata } from '@/lib/seo';

type Params = Promise<{ slug: string; lecon: string }>;

export const metadata: Metadata = { ...privateMetadata, title: 'Leçon' };

/**
 * Leçon d'une formation. La page ne contient aucune donnée : la leçon est demandée par le
 * navigateur, avec le jeton si la personne est connectée (l'API vérifie le pack). La leçon
 * d'exemple est servie sans compte. Jamais indexée (contenu payant).
 */
export default async function LessonPage({ params }: { params: Params }) {
  const { slug, lecon } = await params;
  return <LessonView courseSlug={slug} lessonSlug={lecon} />;
}
