import { HttpStatus, Injectable } from '@nestjs/common';
import type { AddressType, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import type { AddressDto, CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

const MAX_ADDRESSES = 20;

const ADDRESS_SELECT = {
  id: true,
  type: true,
  label: true,
  firstName: true,
  lastName: true,
  line1: true,
  line2: true,
  postalCode: true,
  city: true,
  country: true,
  phone: true,
  isDefault: true,
} satisfies Prisma.AddressSelect;

function notFound(): AppException {
  return new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Adresse introuvable.');
}

/**
 * Carnet d'adresses. Chaque requête est filtrée par l'identifiant de l'utilisateur authentifié :
 * l'adresse d'un autre compte est indiscernable d'une adresse inexistante (404, anti-IDOR).
 */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<AddressDto[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: ADDRESS_SELECT,
    });
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressDto> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCode.UNPROCESSABLE,
          `Vous ne pouvez pas enregistrer plus de ${MAX_ADDRESSES} adresses.`,
        );
      }
      if (dto.isDefault) await this.clearDefault(tx, userId, dto.type);
      return tx.address.create({
        data: {
          userId,
          type: dto.type,
          label: dto.label ?? null,
          firstName: dto.firstName,
          lastName: dto.lastName,
          line1: dto.line1,
          line2: dto.line2 ?? null,
          postalCode: dto.postalCode,
          city: dto.city,
          country: dto.country ?? 'FR',
          phone: dto.phone ?? null,
          isDefault: dto.isDefault ?? false,
        },
        select: ADDRESS_SELECT,
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto): Promise<AddressDto> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({
        where: { id, userId },
        select: { type: true },
      });
      if (!existing) throw notFound();
      if (dto.isDefault) await this.clearDefault(tx, userId, dto.type ?? existing.type, id);
      return tx.address.update({
        where: { id },
        data: { ...dto },
        select: ADDRESS_SELECT,
      });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.prisma.address.deleteMany({ where: { id, userId } });
    if (deleted.count === 0) throw notFound();
  }

  private async clearDefault(
    tx: Prisma.TransactionClient,
    userId: string,
    type: AddressType,
    exceptId?: string,
  ): Promise<void> {
    await tx.address.updateMany({
      where: { userId, type, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }
}
