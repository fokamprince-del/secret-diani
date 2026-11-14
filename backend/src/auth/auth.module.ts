import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SessionsModule } from '../sessions/sessions.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google/google-oauth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { RolesGuard } from './guards/roles.guard';
import { LoginAttemptsService } from './login-attempts.service';
import { MfaService } from './mfa/mfa.service';
import { PasswordService } from './password/password.service';
import { ResetCodeService } from './password/reset-code.service';
import { AccessTokenService } from './tokens/access-token.service';
import { UserTokensService } from './tokens/user-tokens.service';

@Module({
  // Secrets fournis à chaque appel (rotation possible) : aucune option par défaut.
  imports: [JwtModule.register({}), SessionsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleOAuthService,
    PasswordService,
    ResetCodeService,
    LoginAttemptsService,
    AccessTokenService,
    UserTokensService,
    MfaService,
    AccessTokenGuard,
    RolesGuard,
    CsrfGuard,
  ],
  exports: [
    AuthService,
    PasswordService,
    LoginAttemptsService,
    AccessTokenGuard,
    RolesGuard,
    SessionsModule,
  ],
})
export class AuthModule {}
