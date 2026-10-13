import type { components } from './schema';

export type ErrorResponse = components['schemas']['ErrorResponseDto'];
export type FieldError = components['schemas']['FieldErrorDto'];

/** Erreur renvoyée par l'API (format stable `{ statusCode, code, message, errors?, requestId }`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];
  readonly requestId: string | undefined;

  constructor(status: number, body: Partial<ErrorResponse> | undefined) {
    super(body?.message ?? defaultMessage(status));
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? `HTTP_${status}`;
    this.fieldErrors = body?.errors ?? [];
    this.requestId = body?.requestId;
  }
}

/** Le réseau a échoué avant toute réponse (hors-ligne, API injoignable, délai dépassé). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Connexion impossible pour le moment.', { cause });
    this.name = 'NetworkError';
  }
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Votre session a expiré. Reconnectez-vous pour continuer.';
  if (status === 403) return 'Vous n’avez pas accès à cette page.';
  if (status === 404) return 'Ce contenu est introuvable.';
  if (status === 429) return 'Trop de tentatives. Patientez une minute avant de réessayer.';
  if (status >= 500) return 'Le service rencontre un problème. Réessayez dans quelques instants.';
  return 'La demande n’a pas pu aboutir.';
}

function isErrorBody(value: unknown): value is Partial<ErrorResponse> {
  return typeof value === 'object' && value !== null && 'message' in value;
}

/** Construit une `ApiError` à partir d'une réponse non réussie d'openapi-fetch. */
export function toApiError(response: Response, body: unknown): ApiError {
  return new ApiError(response.status, isErrorBody(body) ? body : undefined);
}

/**
 * Message lisible à afficher à l'utilisateur, sans jargon technique.
 * Les messages de l'API sont déjà rédigés en français pour être affichés.
 */
export function userMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Connexion impossible. Vérifiez votre connexion internet, puis réessayez.';
  }
  if (error instanceof ApiError) {
    return error.status >= 500 ? defaultMessage(error.status) : error.message;
  }
  return 'Une erreur inattendue est survenue. Réessayez dans quelques instants.';
}

/** Erreurs par champ, indexées par nom de champ, pour React Hook Form. */
export function fieldMessages(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(
    error.fieldErrors.map((field) => [field.field, field.messages.join(' ')] as const),
  );
}
