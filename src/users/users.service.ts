import { Injectable } from '@nestjs/common';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ProfileDto, UpdateProfileDto } from './dto/profile.dto';

const PROFILE_SELECT = {
  id: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  phone: true,
  emailVerifiedAt: true,
  totpEnabledAt: true,
  marketingConsentAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      emailVerified: user.emailVerifiedAt !== null,
      mfaEnabled: user.totpEnabledAt !== null,
      marketingConsent: user.marketingConsentAt !== null,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { marketingConsentAt: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        // Consentement horodaté : la date d'origine est conservée tant qu'il n'est pas retiré.
        ...(dto.marketingConsent !== undefined
          ? {
              marketingConsentAt: dto.marketingConsent
                ? (current.marketingConsentAt ?? new Date())
                : null,
            }
          : {}),
      },
    });
    await this.audit.log({
      action: AuditAction.PROFILE_UPDATED,
      actorId: userId,
      targetType: 'user',
      targetId: userId,
      metadata: { fields: Object.keys(dto).sort().join(',') },
    });
    return this.getProfile(userId);
  }
}
