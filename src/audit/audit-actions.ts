/** Actions journalisées (identifiants stables, consultables dans le back-office). */
export const AuditAction = {
  REGISTERED: 'auth.registered',
  EMAIL_VERIFIED: 'auth.email_verified',
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  LOGIN_LOCKED_OUT: 'auth.login_locked_out',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
  REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET: 'auth.password_reset',
  PASSWORD_CHANGED: 'auth.password_changed',
  EMAIL_CHANGE_REQUESTED: 'auth.email_change_requested',
  EMAIL_CHANGED: 'auth.email_changed',
  MFA_ENABLED: 'auth.mfa_enabled',
  MFA_FAILED: 'auth.mfa_failed',
  MFA_BACKUP_CODE_USED: 'auth.mfa_backup_code_used',
  MFA_BACKUP_CODES_REGENERATED: 'auth.mfa_backup_codes_regenerated',
  SESSION_REVOKED: 'auth.session_revoked',
  ADMIN_CREATED: 'admin.created',
  PROFILE_UPDATED: 'account.profile_updated',
  DATA_EXPORTED: 'account.data_exported',
  ACCOUNT_DELETED: 'account.deleted',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
