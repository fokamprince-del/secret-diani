import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CallRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EmptyToNull, Trim } from '../../common/utils/transforms';
import { SLUG_PATTERN } from '../../content/markdown/slug';

const SLUG_MESSAGE = 'fr: minuscules, chiffres et tirets uniquement';

// --- Packs ----------------------------------------------------------------------------------

export class CreatePackDto {
  @ApiProperty({ example: 'Premium' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(120)
  slug?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(500)
  summary?: string | null;

  @ApiProperty({ example: 19999 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priceCents!: number;

  @ApiProperty({
    example: 3,
    description: 'Niveau (unique) : un pack inclut les niveaux inférieurs',
  })
  @IsInt()
  @Min(1)
  @Max(20)
  rank!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  features?: string[];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  callsIncluded?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdatePackDto extends PartialType(CreatePackDto) {}

// --- Formations, modules, leçons ------------------------------------------------------------

export class CreateCourseDto {
  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(160)
  slug?: string;

  @ApiProperty({ maxLength: 500 })
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  summary!: string;

  @ApiPropertyOptional({ description: 'Markdown', maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  descriptionMarkdown?: string;

  @ApiProperty({ description: 'Pack minimal qui donne accès à la formation' })
  @IsUUID()
  packId!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  coverMediaId?: string | null;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  coverAlt?: string;

  @ApiPropertyOptional({ default: false, description: 'Formation phare' })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 70 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 160 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}

export class ModuleInputDto {
  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;
}

export class CreateLessonDto {
  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Trim()
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(500)
  summary?: string | null;

  @ApiPropertyOptional({
    description: 'Identifiant de la vidéo Bunny Stream',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @EmptyToNull()
  @Matches(/^[A-Za-z0-9-]{4,100}$/, { message: 'fr: identifiant de vidéo invalide' })
  videoId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86_400)
  videoDurationSeconds?: number | null;

  @ApiPropertyOptional({ description: 'Conseils & astuces (Markdown)', maxLength: 20000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  tipsMarkdown?: string;

  @ApiPropertyOptional({ default: false, description: 'Leçon d’exemple gratuite' })
  @IsOptional()
  @IsBoolean()
  freePreview?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateLessonDto extends PartialType(CreateLessonDto) {
  @ApiPropertyOptional({ description: 'Déplacer la leçon dans un autre module de la formation' })
  @IsOptional()
  @IsUUID()
  moduleId?: string;
}

export class ResourceInputDto {
  @ApiProperty({ description: 'Document PDF de la médiathèque' })
  @IsUUID()
  mediaId!: string;

  @ApiProperty({ example: 'Fiche recette' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ default: false, description: 'Filigrane au nom de la cliente' })
  @IsOptional()
  @IsBoolean()
  watermark?: boolean;
}

export class SetResourcesDto {
  @ApiProperty({ type: [ResourceInputDto], description: 'Liste complète, dans l’ordre' })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ResourceInputDto)
  resources!: ResourceInputDto[];
}

export class QuizChoiceInputDto {
  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label!: string;

  @ApiProperty()
  @IsBoolean()
  isCorrect!: boolean;
}

export class QuizQuestionInputDto {
  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  prompt!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(1000)
  explanation?: string | null;

  @ApiProperty({ type: [QuizChoiceInputDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => QuizChoiceInputDto)
  choices!: QuizChoiceInputDto[];
}

export class SetQuizDto {
  @ApiPropertyOptional({ default: 70 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passScorePercent?: number;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Vide = illimité' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number | null;

  @ApiProperty({ type: [QuizQuestionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionInputDto)
  questions!: QuizQuestionInputDto[];
}

// --- Accès, appels ----------------------------------------------------------------------------

export class GrantAccessDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsUUID()
  packId!: string;

  @ApiProperty({ enum: ['gift', 'admin'] })
  @IsIn(['gift', 'admin'])
  source!: 'gift' | 'admin';

  @ApiPropertyOptional({ description: 'Fin de l’accès (vide = sans limite)' })
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class RevokeAccessDto {
  @ApiProperty({ example: 'Accès offert par erreur' })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}

export class AccessQueryDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;
}

export class UpdateCallRequestDto {
  @ApiPropertyOptional({ enum: CallRequestStatus })
  @IsOptional()
  @IsEnum(CallRequestStatus)
  status?: CallRequestStatus;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsDateString({ strict: true })
  scheduledAt?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @EmptyToNull()
  @IsString()
  @MaxLength(1000)
  adminNote?: string | null;
}

export class CallRequestQueryDto {
  @ApiPropertyOptional({ enum: CallRequestStatus })
  @IsOptional()
  @IsEnum(CallRequestStatus)
  status?: CallRequestStatus;
}

export class CourseStatsDto {
  @ApiProperty()
  courseId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Clientes ayant accès' })
  enrolled!: number;

  @ApiProperty({ description: 'Clientes ayant commencé (au moins une leçon ouverte)' })
  started!: number;

  @ApiProperty({ description: 'Certificats délivrés' })
  completed!: number;

  @ApiProperty({ description: 'Taux de complétion (%) des inscrites' })
  completionRate!: number;
}

// --- Réponses de l'administration (D-076) ------------------------------------------------------

export class AdminPackDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty() priceCents!: number;
  @ApiProperty({ description: 'Niveau : un pack ouvre les formations de niveau inférieur ou égal' })
  rank!: number;
  @ApiProperty({ type: [String] }) features!: string[];
  @ApiProperty() callsIncluded!: number;
  @ApiProperty() visible!: boolean;
}

class AdminCoursePackRefDto {
  @ApiProperty() name!: string;
  @ApiProperty() rank!: number;
}

class LessonCountDto {
  @ApiProperty() lessons!: number;
}

export class AdminCourseListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['draft', 'published'] }) status!: string;
  @ApiProperty() featured!: boolean;
  @ApiProperty() position!: number;
  @ApiProperty({ type: AdminCoursePackRefDto }) pack!: AdminCoursePackRefDto;
  @ApiProperty({ type: LessonCountDto }) _count!: LessonCountDto;
}

class AdminQuizChoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() isCorrect!: boolean;
}

class AdminQuizQuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() prompt!: string;
  @ApiProperty({ nullable: true, type: String }) explanation!: string | null;
  @ApiProperty({ type: [AdminQuizChoiceDto] }) choices!: AdminQuizChoiceDto[];
}

class AdminQuizDto {
  @ApiProperty() passScorePercent!: number;
  @ApiProperty({ nullable: true, type: Number, description: 'Vide : tentatives illimitées' })
  maxAttempts!: number | null;
  @ApiProperty({ type: [AdminQuizQuestionDto] }) questions!: AdminQuizQuestionDto[];
}

class AdminResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() mediaId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() watermark!: boolean;
}

class AdminLessonDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Identifiant Bunny Stream' })
  videoId!: string | null;
  @ApiProperty({ nullable: true, type: Number }) videoDurationSeconds!: number | null;
  @ApiProperty() tipsMarkdown!: string;
  @ApiProperty() freePreview!: boolean;
  @ApiProperty() published!: boolean;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [AdminResourceDto] }) resources!: AdminResourceDto[];
  @ApiProperty({ type: AdminQuizDto, nullable: true }) quiz!: AdminQuizDto | null;
}

class AdminModuleDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ type: [AdminLessonDto] }) lessons!: AdminLessonDto[];
}

export class AdminCourseDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() summary!: string;
  @ApiProperty() descriptionMarkdown!: string;
  @ApiProperty() packId!: string;
  @ApiProperty({ nullable: true, type: String }) coverMediaId!: string | null;
  @ApiProperty() coverAlt!: string;
  @ApiProperty() featured!: boolean;
  @ApiProperty({ enum: ['draft', 'published'] }) status!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ nullable: true, type: String }) seoTitle!: string | null;
  @ApiProperty({ nullable: true, type: String }) seoDescription!: string | null;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [AdminModuleDto], description: 'Modules et leçons, quiz avec réponses' })
  modules!: AdminModuleDto[];
}

class AccessPackRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() rank!: number;
}

export class AdminAccessDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['purchase', 'gift', 'admin'] }) source!: string;
  @ApiProperty({ nullable: true, type: String }) orderId!: string | null;
  @ApiProperty({ nullable: true, type: Date }) expiresAt!: Date | null;
  @ApiProperty({ nullable: true, type: Date }) revokedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: AccessPackRefDto }) pack!: AccessPackRefDto;
}

export class GrantedAccessDto {
  @ApiProperty() id!: string;
}

class CallRequestUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) firstName!: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName!: string | null;
}

export class AdminCallRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: CallRequestStatus }) status!: CallRequestStatus;
  @ApiProperty() message!: string;
  @ApiProperty({ nullable: true, type: Date }) scheduledAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true, type: String }) adminNote!: string | null;
  @ApiProperty({ type: CallRequestUserDto }) user!: CallRequestUserDto;
}
