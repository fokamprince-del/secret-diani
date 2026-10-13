import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { clientContext } from '../common/auth/client-context';
import { CurrentUser } from '../common/auth/decorators';
import { DeleteAccountDto } from '../users/dto/profile.dto';
import { RgpdService } from './rgpd.service';

@ApiTags('Compte — données personnelles (RGPD)')
@ApiBearerAuth()
@Controller('me')
export class RgpdController {
  constructor(private readonly rgpd: RgpdService) {}

  @Get('export')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Content-Disposition', 'attachment; filename="mes-donnees-les-secrets-de-diani.json"')
  @ApiOperation({ summary: 'Télécharger mes données (droit d’accès et de portabilité)' })
  @ApiOkResponse({ description: 'Fichier JSON de toutes les données du compte' })
  exportData(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.rgpd.exportData(user.id);
  }

  @Delete()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer mon compte (droit à l’effacement)',
    description:
      'Mot de passe exigé. Les données personnelles sont effacées ; les factures sont conservées 10 ans (obligation légale).',
  })
  @ApiNoContentResponse()
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.rgpd.deleteAccount(user, dto.password, clientContext(req));
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }
}
