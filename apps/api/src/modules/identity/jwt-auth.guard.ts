import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { TokenService } from './token.service';

/** Marks an endpoint public (registration, sign-in, invitation preview). */
export const PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator => (target, key, descriptor) => {
  Reflect.defineMetadata(PUBLIC_KEY, true, descriptor.value as object);
  return descriptor;
};

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * A global guard: by default EVERY endpoint requires authentication.
 *
 * A deliberate choice — being public has to be marked explicitly with @Public().
 * The other way round (a guard only where we remember to put one) means a
 * forgotten decorator opens data silently.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.get<boolean>(PUBLIC_KEY, context.getHandler());
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'missing_token', message: 'Authorization required.' });
    }

    const payload = await this.tokens.verifyAccess(header.slice(7));
    req.user = { id: payload.sub, email: payload.email };
    return true;
  }
}

/** `@CurrentUser() user: AuthenticatedUser` */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!req.user) throw new UnauthorizedException();
    return req.user;
  },
);
