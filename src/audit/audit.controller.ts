import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
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
}

@ApiTags('Administration — audit')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Consulter le journal d’audit (du plus récent au plus ancien)' })
  @ApiOkResponse({ description: 'Page d’entrées et curseur suivant' })
  list(@Query() query: AuditQueryDto): Promise<CursorPage<AuditLogView>> {
    return this.audit.list({ ...query, limit: query.limit ?? 20 });
  }
}
