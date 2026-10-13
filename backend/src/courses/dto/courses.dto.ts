import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
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
import { Trim } from '../../common/utils/transforms';
import { PublicImageDto, SeoDto } from '../../content/common/content-responses.dto';
import { CheckoutAddressDto } from '../../shop/dto/cart.dto';

// --- Catalogue public -----------------------------------------------------------------------

export class CourseRefDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;
}

export class PackDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'premium' })
  slug!: string;

  @ApiProperty({ example: 'Premium' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  summary!: string | null;

  @ApiProperty({ example: 19999, description: 'Prix TTC en centimes' })
  priceCents!: number;

  @ApiProperty({ description: 'Niveau : un pack inclut tous les packs de niveau inférieur' })
  rank!: number;

  @ApiProperty({ type: [String], description: 'Contenus et avantages, à afficher en liste' })
  features!: string[];

  @ApiProperty({ description: 'Appels personnalisés inclus' })
  callsIncluded!: number;

  @ApiProperty({
    type: [CourseRefDto],
    description: 'Formations accessibles avec ce pack (packs inférieurs compris)',
  })
  courses!: CourseRefDto[];
}

export class PackRefDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  rank!: number;

  @ApiProperty()
  priceCents!: number;
}

export class CourseCardDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ type: PublicImageDto, nullable: true })
  cover!: PublicImageDto | null;

  @ApiProperty({ description: 'Formation phare' })
  featured!: boolean;

  @ApiProperty({ type: PackRefDto, description: 'Pack minimal qui donne accès à la formation' })
  pack!: PackRefDto;

  @ApiProperty()
  lessonCount!: number;

  @ApiProperty({ description: 'Durée totale des vidéos (minutes)' })
  durationMinutes!: number;
}

export class OutlineLessonDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: Number })
  durationSeconds!: number | null;

  @ApiProperty({ description: 'Leçon d’exemple consultable gratuitement' })
  freePreview!: boolean;

  @ApiProperty({ description: 'Quiz à la fin de la leçon' })
  hasQuiz!: boolean;
}

export class OutlineModuleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: [OutlineLessonDto] })
  lessons!: OutlineLessonDto[];
}

export class CourseDetailDto extends CourseCardDto {
  @ApiProperty({ description: 'Description en HTML assaini' })
  descriptionHtml!: string;

  @ApiProperty({ type: [OutlineModuleDto], description: 'Programme (titres seulement)' })
  modules!: OutlineModuleDto[];

  @ApiProperty({ type: SeoDto })
  seo!: SeoDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Données structurées schema.org (Course)',
  })
  jsonLd!: Record<string, unknown>;
}

// --- Leçon ----------------------------------------------------------------------------------

export class PlaybackDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Playlist HLS signée (hls.js) ; null si la vidéo est indisponible',
  })
  hlsUrl!: string | null;

  @ApiProperty({ nullable: true, type: Date, description: 'Fin de validité de l’URL' })
  expiresAt!: Date | null;

  @ApiProperty({ nullable: true, type: Number })
  durationSeconds!: number | null;
}

export class QuizChoiceViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;
}

export class QuizQuestionViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  prompt!: string;

  @ApiProperty({ description: 'Plusieurs bonnes réponses possibles' })
  multiple!: boolean;

  @ApiProperty({
    type: [QuizChoiceViewDto],
    description: 'Choix proposés (jamais la bonne réponse)',
  })
  choices!: QuizChoiceViewDto[];
}

export class QuizViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  passScorePercent!: number;

  @ApiProperty({ nullable: true, type: Number })
  maxAttempts!: number | null;

  @ApiProperty({ description: 'Tentatives déjà faites' })
  attemptsUsed!: number;

  @ApiProperty({ nullable: true, type: Number })
  bestScore!: number | null;

  @ApiProperty()
  passed!: boolean;

  @ApiProperty({ type: [QuizQuestionViewDto] })
  questions!: QuizQuestionViewDto[];
}

export class ResourceViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Fiche recette' })
  title!: string;

  @ApiProperty({ nullable: true, type: Number })
  sizeBytes!: number | null;
}

export class LessonNavDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;
}

export class LessonProgressViewDto {
  @ApiProperty({ description: 'Position de reprise (secondes)' })
  positionSeconds!: number;

  @ApiProperty()
  videoCompleted!: boolean;

  @ApiProperty()
  completed!: boolean;
}

export class LessonDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  summary!: string | null;

  @ApiProperty({ type: CourseRefDto })
  course!: CourseRefDto;

  @ApiProperty()
  moduleTitle!: string;

  @ApiProperty({ type: PlaybackDto })
  video!: PlaybackDto;

  @ApiProperty({ description: 'Bloc « Conseils & astuces » (HTML assaini)' })
  tipsHtml!: string;

  @ApiProperty({ type: [ResourceViewDto] })
  resources!: ResourceViewDto[];

  @ApiProperty({ type: QuizViewDto, nullable: true })
  quiz!: QuizViewDto | null;

  @ApiProperty({
    type: LessonProgressViewDto,
    nullable: true,
    description: 'Null pour une leçon d’exemple consultée sans compte',
  })
  progress!: LessonProgressViewDto | null;

  @ApiProperty({ type: LessonNavDto, nullable: true })
  previous!: LessonNavDto | null;

  @ApiProperty({ type: LessonNavDto, nullable: true })
  next!: LessonNavDto | null;
}

// --- Espace membre --------------------------------------------------------------------------

export class MyCourseDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: PublicImageDto, nullable: true })
  cover!: PublicImageDto | null;

  @ApiProperty({ description: 'Progression (%)' })
  progressPercent!: number;

  @ApiProperty({ type: LessonNavDto, nullable: true, description: 'Bouton « Reprendre »' })
  resume!: LessonNavDto | null;

  @ApiProperty({ nullable: true, type: String, description: 'Numéro du certificat, si obtenu' })
  certificateNumber!: string | null;
}

export class MyLessonStateDto extends OutlineLessonDto {
  @ApiProperty()
  completed!: boolean;
}

export class MyModuleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  progressPercent!: number;

  @ApiProperty({ type: [MyLessonStateDto] })
  lessons!: MyLessonStateDto[];
}

export class MyCourseDetailDto extends MyCourseDto {
  @ApiProperty({ type: [MyModuleDto] })
  modules!: MyModuleDto[];
}

export class SaveProgressDto {
  @ApiProperty({ description: 'Position de lecture (secondes), envoyée toutes les ~15 s' })
  @IsInt()
  @Min(0)
  @Max(86_400)
  positionSeconds!: number;

  @ApiPropertyOptional({ description: 'La vidéo a été vue jusqu’au bout' })
  @IsOptional()
  @IsBoolean()
  videoCompleted?: boolean;
}

export class QuizAnswerDto {
  @ApiProperty()
  @IsUUID()
  questionId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  choiceIds!: string[];
}

export class SubmitQuizDto {
  @ApiProperty({ type: [QuizAnswerDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers!: QuizAnswerDto[];
}

export class GradedQuestionDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty()
  correct!: boolean;

  @ApiProperty({ type: [String], description: 'Bonnes réponses (révélées après validation)' })
  correctChoiceIds!: string[];

  @ApiProperty({ nullable: true, type: String })
  explanation!: string | null;
}

export class QuizResultDto {
  @ApiProperty()
  scorePercent!: number;

  @ApiProperty()
  passed!: boolean;

  @ApiProperty({ type: [GradedQuestionDto] })
  questions!: GradedQuestionDto[];

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Tentatives restantes (null = illimité)',
  })
  attemptsRemaining!: number | null;

  @ApiProperty({ description: 'Leçon terminée après cette tentative' })
  lessonCompleted!: boolean;
}

export class CertificateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'DIANI-2026-7K3QF9XA' })
  number!: string;

  @ApiProperty()
  courseTitle!: string;

  @ApiProperty()
  holderName!: string;

  @ApiProperty()
  issuedAt!: Date;

  @ApiProperty({ description: 'PDF prêt au téléchargement' })
  pdfAvailable!: boolean;

  @ApiProperty({ description: 'Page publique de vérification' })
  verificationUrl!: string;
}

export class CertificateVerificationDto {
  @ApiProperty()
  number!: string;

  @ApiProperty()
  valid!: boolean;

  @ApiProperty({ nullable: true, type: String })
  holderName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  courseTitle!: string | null;

  @ApiProperty({ nullable: true, type: Date })
  issuedAt!: Date | null;
}

export class PerksDto {
  @ApiProperty({ description: 'Appels personnalisés inclus dans les packs détenus' })
  callsIncluded!: number;

  @ApiProperty()
  callsUsed!: number;

  @ApiProperty()
  callsRemaining!: number;

  @ApiProperty({
    type: [String],
    description: 'Avantages des packs détenus (fournisseurs offerts…)',
  })
  features!: string[];
}

export class CreateCallRequestDto {
  @ApiProperty({
    description: 'Sujet et disponibilités',
    example: 'Organisation d’un buffet ; mardi ou jeudi soir',
  })
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;
}

export class CallRequestDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['requested', 'scheduled', 'done', 'cancelled'] })
  status!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ nullable: true, type: Date })
  scheduledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PackCheckoutDto {
  @ApiProperty({ type: CheckoutAddressDto, description: 'Adresse de facturation' })
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  billingAddress!: CheckoutAddressDto;

  @ApiProperty({ description: 'Acceptation des conditions générales de vente' })
  @Equals(true, { message: 'fr: les conditions générales de vente doivent être acceptées' })
  acceptTerms!: boolean;

  @ApiPropertyOptional({ description: 'Jeton Cloudflare Turnstile (obligatoire en production)' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}

export class CertificateNumberParamDto {
  @ApiProperty({ example: 'DIANI-2026-7K3QF9XA' })
  @Matches(/^DIANI-\d{4}-[0-9A-Z]{8}$/, { message: 'fr: numéro de certificat invalide' })
  number!: string;
}
