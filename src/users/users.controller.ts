import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser } from '../common/auth/decorators';
import { ProfileDto, UpdateProfileDto } from './dto/profile.dto';
import { UsersService } from './users.service';

@ApiTags('Compte — profil')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Mon profil' })
  @ApiOkResponse({ type: ProfileDto })
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileDto> {
    return this.users.getProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Modifier mon profil (nom, téléphone, consentement aux e-mails)' })
  @ApiOkResponse({ type: ProfileDto })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.users.updateProfile(user.id, dto);
  }
}
