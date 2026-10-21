import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController, UsersController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PushModule } from '../push/push.module';
import { VisibilityModule } from '../visibility/visibility.module';
import { OauthVerifier } from './oauth.verifier';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  // VisibilityModule for the family context of the admin route; PushModule
  // so an admin's reset link knocks on its person's phone as well.
  imports: [JwtModule.register({}), VisibilityModule, PushModule],
  controllers: [AuthController, UsersController, PasswordResetController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    PasswordResetService,
    OauthVerifier,
    JwtAuthGuard,
  ],
  exports: [TokenService, JwtAuthGuard],
})
export class IdentityModule {}
