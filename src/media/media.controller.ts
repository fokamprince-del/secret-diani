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
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';
import { CurrentUser, Roles } from '../common/auth/decorators';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import type { CursorPage } from '../common/pagination/cursor';
import {
  CreateUploadDto,
  DownloadUrlDto,
  MediaDto,
  MediaQueryDto,
  PresignedUploadDto,
  UpdateMediaDto,
  UploadMediaDto,
} from './dto/media.dto';
import { MAX_BYTES } from './file-signature';
import { MediaService, type UploadedFile as MediaFile } from './media.service';

@ApiTags('Administration — médias')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(
    // Sans `dest`, multer garde le fichier en mémoire (jamais écrit sur le disque du conteneur).
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES.document, files: 1, fields: 5, fieldSize: 1024, parts: 7 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        alt: { type: 'string', maxLength: 300 },
      },
    },
  })
  @ApiOperation({
    summary: 'Envoyer un fichier (image ≤ 15 Mo, PDF ≤ 30 Mo)',
    description:
      'Type réel vérifié (octets magiques), renommage aléatoire, analyse antivirus, variantes WebP/AVIF sans EXIF. Le média passe à « ready » une fois traité par le worker.',
  })
  @ApiCreatedResponse({ type: MediaDto })
  upload(
    @UploadedFile() file: MediaFile | undefined,
    @Body() dto: UploadMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaDto> {
    if (!file) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'Aucun fichier reçu.',
        [{ field: 'file', messages: ['ce champ est obligatoire'] }],
      );
    }
    return this.media.upload(file, dto.alt, user.id);
  }

  @Post('uploads')
  @ApiOperation({
    summary: 'Préparer un envoi direct au stockage (gros fichiers)',
    description:
      'Renvoie une URL PUT signée (10 min). Après l’envoi, appeler POST /admin/media/{id}/complete.',
  })
  @ApiCreatedResponse({ type: PresignedUploadDto })
  createUpload(
    @Body() dto: CreateUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PresignedUploadDto> {
    return this.media.createUpload(dto, user.id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Signaler la fin d’un envoi direct (lance le traitement)' })
  @ApiOkResponse({ type: MediaDto })
  complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaDto> {
    return this.media.completeUpload(id, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Médiathèque (du plus récent au plus ancien)' })
  @ApiOkResponse({ description: 'Page de médias et curseur suivant' })
  list(@Query() query: MediaQueryDto): Promise<CursorPage<MediaDto>> {
    return this.media.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: MediaDto })
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<MediaDto> {
    return this.media.get(id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'URL de téléchargement signée d’un document PDF (5 min)' })
  @ApiOkResponse({ type: DownloadUrlDto })
  download(@Param('id', new ParseUUIDPipe()) id: string): Promise<DownloadUrlDto> {
    return this.media.downloadUrl(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier le texte alternatif' })
  @ApiOkResponse({ type: MediaDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaDto> {
    return this.media.updateAlt(id, dto.alt, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un média (refusé s’il est utilisé)' })
  @ApiNoContentResponse()
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.media.remove(id, user.id);
  }
}
