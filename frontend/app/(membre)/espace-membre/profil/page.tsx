import type { Metadata } from 'next';
import { ProfilePanel } from '@/components/member/ProfileForms';

export const metadata: Metadata = { title: 'Mon profil' };

export default function ProfilePage() {
  return (
    <>
      <h1>Mon profil</h1>
      <ProfilePanel />
    </>
  );
}
