import * as Sentry from '@sentry/nestjs';

/**
 * Initialisation Sentry : doit être importé avant tout autre module.
 * Aucune donnée personnelle n'est envoyée (pas d'IP, de cookies, d'en-têtes ni de corps).
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
  });
}
