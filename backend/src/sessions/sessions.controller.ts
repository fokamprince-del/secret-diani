import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser } from '../common/auth/decorators';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { SessionsService, type SessionView } from './sessions.service';

@ApiTags('Compte — sessions')
@ApiBearerAuth()
@Controller('me/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister mes sessions actives (appareils connectés)' })
  @ApiOkResponse({ description: 'Sessions actives, la session courante est signalée' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<SessionView[]> {
    return this.sessions.listForUser(user.id, user.sessionId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Déconnecter un de mes appareils' })
  @ApiNoContentResponse({ description: 'Session révoquée' })
  @ApiNotFoundResponse({ description: 'Session introuvable (ou appartenant à un autre compte)' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.sessions.revokeOwn(user.id, id);
    await this.audit.log({
      action: AuditAction.SESSION_REVOKED,
      actorId: user.id,
      targetType: 'session',
      targetId: id,
    });
  }
}
