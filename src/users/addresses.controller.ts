import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser } from '../common/auth/decorators';
import { ErrorResponseDto } from '../common/errors/error-response';
import { AddressesService } from './addresses.service';
import { AddressDto, CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@ApiTags('Compte — adresses')
@ApiBearerAuth()
@Controller('me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'Mes adresses' })
  @ApiOkResponse({ type: [AddressDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<AddressDto[]> {
    return this.addresses.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Ajouter une adresse' })
  @ApiCreatedResponse({ type: AddressDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressDto> {
    return this.addresses.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une adresse' })
  @ApiOkResponse({ type: AddressDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une adresse' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.addresses.remove(user.id, id);
  }
}
