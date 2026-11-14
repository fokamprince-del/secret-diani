import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
/** Durée laissée pour choisir son compte Google et revenir. */
export const GOOGLE_FLOW_TTL_SECONDS = 600;
const FLOW_KEY = (state: string) => `auth:google:flow:${state}`;

/** Profil Google retenu après vérification du jeton d'identité. */
export interface GoogleProfile {
  subject: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** Échec du parcours Google : le code est transmis tel quel au site (`?erreur=`). */
export class GoogleAuthError extends Error {
  constructor(
    readonly code:
      | 'google_annule'
      | 'google_expire'
      | 'google_refuse'
      | 'google_indisponible'
      | 'google_suspendu'
      | 'google_admin',
    message: string,
  ) {
    super(message);
  }
}

interface FlowState {
  verifier: string;
  nonce: string;
  next: string;
}

const base64url = (buffer: Buffer) => buffer.toString('base64url');
const random = () => base64url(randomBytes(32));

/** Chemin interne uniquement (jamais d'URL absolue : pas de redirection ouverte). */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || !/^\/(?![/\\])[\w\-./?=&%]*$/.test(value))
    return '/espace-membre';
  return value.slice(0, 200);
}

/**
 * Connexion avec Google, flux « authorization code » d'OpenID Connect, côté serveur :
 * - `state` (lié au navigateur par un cookie) contre la falsification de requête ;
 * - PKCE (S256) et `nonce` contre l'interception ou le rejeu du code ;
 * - le jeton d'identité est reçu directement de Google sur TLS (canal serveur à serveur) :
 *   sa signature n'a pas à être revérifiée (OIDC Core § 3.1.3.7), mais l'émetteur, l'audience,
 *   l'expiration, le nonce et la vérification de l'e-mail le sont.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly redirectUri: string;

  constructor(
    config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.clientId = config.get('GOOGLE_CLIENT_ID');
    this.clientSecret = config.get('GOOGLE_CLIENT_SECRET');
    const apiBase = (config.get('PUBLIC_API_URL') ?? config.get('PUBLIC_SITE_URL')).replace(
      /\/$/,
      '',
    );
    this.redirectUri = `${apiBase}/api/v1/auth/google/callback`;
  }

  get enabled(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  /** Prépare le passage chez Google : URL à ouvrir et `state` à poser en cookie. */
  async start(next: string): Promise<{ url: string; state: string }> {
    const state = random();
    const verifier = random();
    const nonce = random();
    const flow: FlowState = { verifier, nonce, next: safeNextPath(next) };
    await this.redis.set(FLOW_KEY(state), JSON.stringify(flow), 'EX', GOOGLE_FLOW_TTL_SECONDS);

    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return { url: url.toString(), state };
  }

  /**
   * Retour de Google. Le flux est consommé dès sa lecture (usage unique) ; `cookieState` doit
   * être celui posé au départ dans ce même navigateur.
   */
  async finish(params: {
    code?: string;
    state?: string;
    error?: string;
    cookieState?: string;
  }): Promise<{ profile: GoogleProfile; next: string }> {
    if (params.error) {
      throw new GoogleAuthError('google_annule', `Google a renvoyé « ${params.error} »`);
    }
    if (!params.code || !params.state || params.state !== params.cookieState) {
      throw new GoogleAuthError('google_expire', 'state absent ou différent du cookie');
    }
    const raw = await this.redis.getdel(FLOW_KEY(params.state));
    if (!raw) throw new GoogleAuthError('google_expire', 'flux inconnu ou expiré');
    const flow = JSON.parse(raw) as FlowState;

    const idToken = await this.exchange(params.code, flow.verifier);
    return { profile: this.verifyIdToken(idToken, flow.nonce), next: flow.next };
  }

  private async exchange(code: string, verifier: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn({ err: error }, 'Google injoignable pendant l’échange du code');
      throw new GoogleAuthError('google_indisponible', 'échange du code impossible');
    }
    const body = (await response.json().catch(() => ({}))) as { id_token?: unknown };
    if (!response.ok || typeof body.id_token !== 'string') {
      this.logger.warn({ status: response.status }, 'Échange du code Google refusé');
      throw new GoogleAuthError('google_refuse', 'échange du code refusé');
    }
    return body.id_token;
  }

  /** Lit et contrôle les revendications du jeton d'identité (voir la note de la classe). */
  verifyIdToken(idToken: string, nonce: string, now = Date.now()): GoogleProfile {
    let claims: Record<string, unknown>;
    try {
      const payload = idToken.split('.')[1] ?? '';
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new GoogleAuthError('google_refuse', 'jeton d’identité illisible');
    }
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const checks = [
      ISSUERS.has(String(claims.iss)),
      audience.includes(this.clientId),
      typeof claims.exp === 'number' && claims.exp * 1000 > now - 60_000,
      claims.nonce === nonce,
      typeof claims.sub === 'string' && claims.sub.length > 0,
      typeof claims.email === 'string' && claims.email.includes('@'),
      claims.email_verified === true,
    ];
    if (checks.includes(false)) {
      throw new GoogleAuthError('google_refuse', 'jeton d’identité non conforme');
    }
    const text = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, 100) : null;
    return {
      subject: claims.sub as string,
      email: (claims.email as string).toLowerCase(),
      firstName: text(claims.given_name),
      lastName: text(claims.family_name),
    };
  }
}
