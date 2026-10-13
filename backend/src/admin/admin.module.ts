import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthModule } from '../auth/auth.module';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../common/auth/decorators';
import { CursorQueryDto } from '../common/pagination/cursor';
import { Trim } from '../common/utils/transforms';
import { RgpdModule } from '../rgpd/rgpd.module';
import { DashboardService } from './dashboard/dashboard.service';
import { AdminUsersService } from './users/admin-users.service';

// --- Tableau de bord ---------------------------------------------------------------------------

export class DashboardQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 30, description: 'Période en jours' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

class PeriodDto {
  @ApiProperty() days!: number;
  @ApiProperty({ example: '2026-09-14' }) from!: string;
  @ApiProperty({ example: '2026-10-13' }) to!: string;
}

class SalesSplitDto {
  @ApiProperty() orders!: number;
  @ApiProperty() grossCents!: number;
}

class DailySalesDto extends SalesSplitDto {
  @ApiProperty({ example: '2026-10-13' }) day!: string;
}

class SalesDto {
  @ApiProperty() orders!: number;
  @ApiProperty() grossCents!: number;
  @ApiProperty() refundedCents!: number;
  @ApiProperty() netCents!: number;
  @ApiProperty({ type: SalesSplitDto, description: 'Boutique (kits, produits)' })
  shop!: SalesSplitDto;
  @ApiProperty({ type: SalesSplitDto, description: 'Packs de formation' })
  courses!: SalesSplitDto;
  @ApiProperty({ type: [DailySalesDto], description: 'Un point par jour, zéro compris' })
  daily!: DailySalesDto[];
}

class TodoDto {
  @ApiProperty({ description: 'Commandes payées ou en préparation à expédier ou à remettre' })
  ordersToShip!: number;
  @ApiProperty({ description: 'Demandes traiteur nouvelles ou en discussion' })
  cateringPending!: number;
  @ApiProperty({ description: 'Événements traiteur confirmés dans les 14 prochains jours' })
  cateringUpcoming!: number;
  @ApiProperty() contactMessagesNew!: number;
  @ApiProperty() callRequestsPending!: number;
}

class CustomersDto {
  @ApiProperty() newAccounts!: number;
  @ApiProperty() verifiedNewAccounts!: number;
  @ApiProperty() totalActive!: number;
}

class CoursesSummaryDto {
  @ApiProperty() newAccesses!: number;
  @ApiProperty() activeAccesses!: number;
}

class NewsletterSummaryDto {
  @ApiProperty() confirmed!: number;
  @ApiProperty() newConfirmed!: number;
}

class LowStockLineDto {
  @ApiProperty() variantId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() label!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() available!: number;
  @ApiProperty() threshold!: number;
}

export class DashboardDto {
  @ApiProperty({ type: PeriodDto }) period!: PeriodDto;
  @ApiProperty({ type: SalesDto }) sales!: SalesDto;
  @ApiProperty({ type: TodoDto }) todo!: TodoDto;
  @ApiProperty({ type: CustomersDto }) customers!: CustomersDto;
  @ApiProperty({ type: CoursesSummaryDto }) courses!: CoursesSummaryDto;
  @ApiProperty({ type: NewsletterSummaryDto }) newsletter!: NewsletterSummaryDto;
  @ApiProperty({ type: [LowStockLineDto] }) lowStock!: LowStockLineDto[];
}

@ApiTags('Administration — tableau de bord')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Ventes, choses à faire, clientes, formations, newsletter, stocks bas' })
  @ApiOkResponse({ type: DashboardDto })
  get(@Query() query: DashboardQueryDto): Promise<DashboardDto> {
    return this.dashboard.get(query.days ?? 30);
  }
}

// --- Utilisateurs ------------------------------------------------------------------------------

export class AdminUserQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Recherche dans l’e-mail, le prénom et le nom' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    enum: UserStatus,
    description: 'Par défaut : tous les comptes sauf les comptes supprimés',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) firstName!: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName!: string | null;
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() mfaEnabled!: boolean;
  @ApiProperty({ nullable: true, type: Date }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

class AdminUserListDto {
  @ApiProperty({ type: [AdminUserDto] }) items!: AdminUserDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}

class AdminUserStatsDto {
  @ApiProperty() orders!: number;
  @ApiProperty() paidOrders!: number;
  @ApiProperty() activeSessions!: number;
  @ApiProperty({ description: 'Accès actifs à des packs de formation' }) activeAccesses!: number;
}

class AdminUserOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: number;
  @ApiProperty() status!: string;
  @ApiProperty() totalCents!: number;
  @ApiProperty() createdAt!: Date;
}

export class AdminUserDetailDto extends AdminUserDto {
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: Date }) lockedAt!: Date | null;
  @ApiProperty() marketingConsent!: boolean;
  @ApiProperty({ type: AdminUserStatsDto }) stats!: AdminUserStatsDto;
  @ApiProperty({ type: [AdminUserOrderDto], description: '5 dernières commandes' })
  recentOrders!: AdminUserOrderDto[];
}

class RevokedSessionsDto {
  @ApiProperty() revoked!: number;
}

@ApiTags('Administration — comptes')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Rechercher des comptes (accès aux formations : /admin/courses/accesses)',
  })
  @ApiOkResponse({ type: AdminUserListDto })
  list(@Query() query: AdminUserQueryDto): Promise<AdminUserListDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminUserDetailDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminUserDetailDto> {
    return this.users.get(id);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspendre le compte (connexion refusée, appareils déconnectés)' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  lock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminUserDetailDto> {
    return this.users.lock(id, user.id);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réactiver le compte (et lever le verrou anti-force brute)' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  unlock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminUserDetailDto> {
    return this.users.unlock(id, user.id);
  }

  @Post(':id/mfa/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Réinitialiser la double authentification (téléphone perdu)' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  resetMfa(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminUserDetailDto> {
    return this.users.resetMfa(id, user.id);
  }

  @Post(':id/sessions/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnecter le compte de tous ses appareils' })
  @ApiOkResponse({ type: RevokedSessionsDto })
  revokeSessions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RevokedSessionsDto> {
    return this.users.revokeSessions(id, user.id);
  }

  @Get(':id/export')
  @Header('Content-Disposition', 'attachment; filename="donnees-compte.json"')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporter les données du compte (demande d’accès RGPD reçue hors ligne)',
  })
  @ApiOkResponse({ description: 'Même contenu que GET /me/export' })
  export(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    return this.users.exportData(id, user.id);
  }
}

/** Back-office : tableau de bord et gestion des comptes (phase 9). */
@Module({
  imports: [AuthModule, RgpdModule],
  controllers: [DashboardController, AdminUsersController],
  providers: [DashboardService, AdminUsersService],
})
export class AdminModule {}
