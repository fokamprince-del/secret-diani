import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID, Matches } from 'class-validator';
import { Roles } from '../common/auth/decorators';
import { CursorQueryDto, type CursorPage } from '../common/pagination/cursor';
import { AuditService, type AuditLogView } from './audit.service';

class AuditQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ example: 'auth.login_failed' })
  @IsOptional()
  @Matches(/^[a-z_]+\.[a-z_]+$/, { message: 'fr: action invalide' })
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: 'user', description: 'Type de la cible (user, order, setting…)' })
  @IsOptional()
  @Matches(/^[a-z_]{1,50}$/, { message: 'fr: type de cible invalide' })
  targetType?: string;

  @ApiPropertyOptional({
    description: 'Identifiant de la cible (historique d’un compte, d’une commande…)',
  })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z', description: 'À partir de (inclus)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00Z', description: 'Jusqu’à (exclu)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

class AuditLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) actorId!: string | null;
  @ApiProperty({ example: 'admin.user_locked' }) action!: string;
  @ApiProperty({ nullable: true, type: String }) targetType!: string | null;
  @ApiProperty({ nullable: true, type: String }) targetId!: string | null;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'Contexte, sans donnée personnelle',
  })
  metadata!: AuditLogView['metadata'];
  @ApiProperty({ nullable: true, type: String, example: '203.0.113.0/24' })
  ipTruncated!: string | null;
  @ApiProperty() createdAt!: Date;
}

class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogDto] }) items!: AuditLogDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

@ApiTags('Administration — audit')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Consulter le journal d’audit (du plus récent au plus ancien)' })
  @ApiOkResponse({ type: AuditLogPageDto })
  list(@Query() query: AuditQueryDto): Promise<CursorPage<AuditLogView>> {
    return this.audit.list({ ...query, limit: query.limit ?? 20 });
  }
}
