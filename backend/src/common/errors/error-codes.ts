/** Codes d'erreur stables exposés au client (le frontend s'appuie dessus, pas sur les messages). */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNPROCESSABLE: 'UNPROCESSABLE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  // Authentification et comptes (phase 2)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
  INVALID_RESET_CODE: 'INVALID_RESET_CODE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  MFA_INVALID: 'MFA_INVALID',
  CSRF_REJECTED: 'CSRF_REJECTED',
  // Traiteur (phase 4)
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  // Boutique (phase 5)
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  QUANTITY_LIMIT: 'QUANTITY_LIMIT',
  CART_EMPTY: 'CART_EMPTY',
  CART_CHANGED: 'CART_CHANGED',
  DOCUMENT_NOT_READY: 'DOCUMENT_NOT_READY',
  // Paiements (phase 6)
  PAYMENT_METHOD_UNAVAILABLE: 'PAYMENT_METHOD_UNAVAILABLE',
  PAYMENT_PROVIDER_ERROR: 'PAYMENT_PROVIDER_ERROR',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ALREADY_PAID: 'ALREADY_PAID',
  WEBHOOK_REJECTED: 'WEBHOOK_REJECTED',
  // Formations (phase 7)
  COURSE_ACCESS_REQUIRED: 'COURSE_ACCESS_REQUIRED',
  ALREADY_ENROLLED: 'ALREADY_ENROLLED',
  QUIZ_ATTEMPTS_EXHAUSTED: 'QUIZ_ATTEMPTS_EXHAUSTED',
  PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
  NO_CALLS_REMAINING: 'NO_CALLS_REMAINING',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

interface StatusDefault {
  code: ErrorCode;
  message: string;
}

const STATUS_DEFAULTS: Record<number, StatusDefault> = {
  400: { code: ErrorCode.BAD_REQUEST, message: 'La requête est invalide.' },
  401: { code: ErrorCode.UNAUTHORIZED, message: 'Authentification requise.' },
  403: { code: ErrorCode.FORBIDDEN, message: 'Accès refusé.' },
  404: { code: ErrorCode.NOT_FOUND, message: 'Ressource introuvable.' },
  405: { code: ErrorCode.METHOD_NOT_ALLOWED, message: 'Méthode non autorisée.' },
  409: {
    code: ErrorCode.CONFLICT,
    message: 'La demande entre en conflit avec l’état actuel de la ressource.',
  },
  413: { code: ErrorCode.PAYLOAD_TOO_LARGE, message: 'La requête est trop volumineuse.' },
  415: { code: ErrorCode.UNSUPPORTED_MEDIA_TYPE, message: 'Type de contenu non pris en charge.' },
  422: { code: ErrorCode.UNPROCESSABLE, message: 'Les données ne peuvent pas être traitées.' },
  429: {
    code: ErrorCode.TOO_MANY_REQUESTS,
    message: 'Trop de requêtes. Merci de réessayer dans quelques instants.',
  },
  500: {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Une erreur interne est survenue. Merci de réessayer plus tard.',
  },
  503: {
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message: 'Service temporairement indisponible. Merci de réessayer plus tard.',
  },
};

export function defaultForStatus(status: number): StatusDefault {
  return (
    STATUS_DEFAULTS[status] ??
    (status >= 500
      ? STATUS_DEFAULTS[500]!
      : { code: ErrorCode.BAD_REQUEST, message: STATUS_DEFAULTS[400]!.message })
  );
}
