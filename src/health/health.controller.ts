import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService, ReadinessReport } from './health.service';

/** Sondes d'infrastructure, servies hors du préfixe /api/v1 (`/health`, `/ready`). */
@ApiTags('Supervision')
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Sonde de vie (le processus répond)' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Sonde de disponibilité (base de données et Redis joignables)' })
  @ApiOkResponse({ schema: { example: { status: 'ok', checks: { database: 'ok', redis: 'ok' } } } })
  @ApiServiceUnavailableResponse({
    schema: { example: { status: 'indisponible', checks: { database: 'erreur', redis: 'ok' } } },
  })
  async readiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: string; checks: ReadinessReport['checks'] }> {
    const report = await this.health.readiness();
    res.status(report.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: report.ready ? 'ok' : 'indisponible', checks: report.checks };
  }
}
