import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/AuthCard';
import { EmailLinkAction } from '@/components/auth/EmailLinkAction';

export const metadata: Metadata = { title: 'Activer mon compte' };

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Activer mon compte">
      <EmailLinkAction action="verify-email" />
    </AuthCard>
  );
}
