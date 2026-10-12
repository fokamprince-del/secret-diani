import type { PrismaClient } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { checkPasswordPolicy } from '../auth/password/password-policy';
import { PasswordService } from '../auth/password/password.service';

export interface CreateAdminInput {
  email: string;
  password: string;
  firstName?: string | null;
  termsVersion: string;
}

export type CreateAdminResult = { ok: true; userId: string } | { ok: false; errors: string[] };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Création d'un administrateur (commande `make create-admin`, jamais en seed).
 * Le second facteur (TOTP) est imposé à la première connexion. Un compte client existant
 * n'est jamais promu ici : la promotion passera par le back-office (phase 9), auditée.
 */
export async function createAdmin(
  prisma: PrismaClient,
  input: CreateAdminInput,
): Promise<CreateAdminResult> {
  const email = input.email.trim().toLowerCase();
  const errors: string[] = [];
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    errors.push('Adresse e-mail invalide.');
  }
  errors.push(
    ...checkPasswordPolicy(input.password, { email, firstName: input.firstName }).map(
      (problem) => `Le mot de passe ${problem}.`,
    ),
  );
  if (errors.length > 0) return { ok: false, errors };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, errors: ['Un compte existe déjà avec cette adresse.'] };

  const passwordHash = await new PasswordService().hash(input.password);
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'admin',
      firstName: input.firstName?.trim() || null,
      emailVerifiedAt: now,
      termsAcceptedAt: now,
      termsVersion: input.termsVersion,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: {
      action: AuditAction.ADMIN_CREATED,
      targetType: 'user',
      targetId: user.id,
      metadata: { via: 'cli' },
    },
  });
  return { ok: true, userId: user.id };
}
