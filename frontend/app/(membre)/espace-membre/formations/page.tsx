import type { Metadata } from 'next';
import { MyCourses } from '@/components/member/MyCourses';

export const metadata: Metadata = { title: 'Mes formations' };

export default function MyCoursesPage() {
  return (
    <>
      <h1>Mes formations</h1>
      <MyCourses />
    </>
  );
}
