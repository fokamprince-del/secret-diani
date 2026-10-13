import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

/** URL fixe : aucun appel sortant vers une adresse fournie par l'utilisateur (SSRF). */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5_000;

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Vérification anti-robot Cloudflare Turnstile (formulaires publics : demande traiteur, contact).
 * Sans clé secrète (développement, tests), la vérification est ignorée ; la production exige
 * la clé (validation de la configuration). Échec de vérification → refus ; Cloudflare
 * injoignable → refus aussi (503) : un formulaire public n'est jamais ouvert sans contrôle.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly secret: string | undefined;

  constructor(config: AppConfigService) {
    this.secret = config.get('TURNSTILE_SECRET_KEY');
  }

  get enabled(): boolean {
    return this.secret !== undefined;
  }

  async verify(token: string | undefined, ip: string): Promise<void> {
    if (!this.secret) return;
    if (!token) throw this.failed();

    let result: SiteverifyResponse;
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: this.secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      result = (await response.json()) as SiteverifyResponse;
    } catch (error) {
      this.logger.error(`Vérification Turnstile impossible : ${(error as Error).message}`);
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SERVICE_UNAVAILABLE,
        'La vérification anti-robot est momentanément indisponible. Merci de réessayer dans quelques instants.',
      );
    }
    if (!result.success) throw this.failed();
  }

  private failed(): AppException {
    return new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.CAPTCHA_FAILED,
      'La vérification anti-robot a échoué. Merci de réessayer.',
    );
  }
}
